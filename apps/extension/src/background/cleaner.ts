import {addressVariants, createMatcher, emptyMatchTable, hostOf, type UrlMatcher} from '@nightstand/core'
import {isChromiumLike} from '@/lib/browser'
import {historySince} from '@/platform/history'
import {loadIndex, STORAGE_KEYS} from '@/platform/storage'
import {cached} from './cached'
import {readState, updateState} from './state'

/**
 * History cleanup. Works while the vault is locked: it only ever uses the
 * hashed match table (`index`), never the vault or its key.
 */

/** Cached matcher; dropped whenever the popup rewrites the match table. */
const matcherCache = cached(() => loadIndex().then((table) => createMatcher(table ?? emptyMatchTable())))

export function getMatcher(): Promise<UrlMatcher> {
  return matcherCache.get()
}

export function invalidateMatcher(): void {
  matcherCache.invalidate()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEYS.index in changes) invalidateMatcher()
})

/** Nightstand's own pages (popup) must never linger in history either. */
const OWN_ORIGIN = new URL(chrome.runtime.getURL('/')).origin

export function isOwnPage(url: string): boolean {
  return url.startsWith(`${OWN_ORIGIN}/`)
}

/**
 * A tab on a protected page, or loading one. Both addresses count: `url` is
 * the page still on screen ("" before a new tab's first page commits),
 * `pendingUrl` the one it is heading to.
 */
export async function isProtectedTab(tab: chrome.tabs.Tab): Promise<boolean> {
  const matcher = await getMatcher()
  if (matcher.isEmpty) return false
  for (const url of [tab.url, tab.pendingUrl]) {
    if (url && (await matcher.matches(url))) return true
  }
  return false
}

/** The open tabs on (or loading) protected pages. */
export async function protectedTabs(): Promise<chrome.tabs.Tab[]> {
  const found: chrome.tabs.Tab[] = []
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined && (await isProtectedTab(tab))) found.push(tab)
  }
  return found
}

/** Ids of the open tabs on (or loading) protected pages. */
export async function protectedTabIds(): Promise<number[]> {
  return (await protectedTabs()).flatMap((tab) => (tab.id === undefined ? [] : [tab.id]))
}

/**
 * Half-width of the window around one visit, in ms (1 µs). History keeps
 * microseconds; `visitTime` is a float in ms, so allow for its rounding.
 */
const VISIT_WINDOW_MS = 0.001

/**
 * Chromium only: deletes each visit of `url` by time instead of by address.
 *
 * Expiring a visit makes Chrome also expire the redirect chain that led to it
 * (what deleting an entry on `chrome://history` does), while `deleteUrl` drops
 * only the URL itself. Those hops never show up in `history.search` and often
 * carry unguessable query strings or another domain — a script redirect from
 * a sign-in or payment page, a `?reload=…` bounce — yet the address bar still
 * suggests them. The window is a couple of microseconds wide, so in practice
 * it only ever holds the visit itself and hops recorded at the same instant.
 *
 * Not on Firefox: its `deleteRange` works in whole milliseconds and has no
 * redirect-parent rule to trigger.
 */
async function expireVisitsWithRedirectParents(url: string): Promise<void> {
  const times = new Set((await chrome.history.getVisits({url})).map((v) => v.visitTime ?? 0))
  times.delete(0)
  for (const t of times) {
    await chrome.history.deleteRange({startTime: t - VISIT_WINDOW_MS, endTime: t + VISIT_WINDOW_MS})
  }
}

/** Addresses deleted at the same time (each is a few history API round trips). */
const DELETE_CONCURRENCY = 8

/**
 * Deletes each URL together with its scheme / `www.` variants: redirect hops
 * of the same visit that `history.search` can't see (see `addressVariants`),
 * and on Chromium the redirect chains that led to its visits. Deleting an
 * address that isn't in history is a no-op.
 */
async function deleteUrls(urls: Iterable<string>): Promise<void> {
  const doomed = new Set<string>()
  for (const url of urls) {
    doomed.add(url)
    for (const variant of addressVariants(url)) doomed.add(variant)
  }
  // Addresses are independent of each other, so several are in flight at
  // once; each one's visits are still expired before the address goes.
  const queue = [...doomed]
  const worker = async () => {
    for (let url = queue.pop(); url !== undefined; url = queue.pop()) {
      if (isChromiumLike) await expireVisitsWithRedirectParents(url)
      await chrome.history.deleteUrl({url})
    }
  }
  await Promise.all(Array.from({length: Math.min(DELETE_CONCURRENCY, queue.length)}, worker))
}

/** Deletes every history item (optionally restricted to a text search) that matches. */
async function purgeMatching(matcher: UrlMatcher, startTime: number, text = ''): Promise<void> {
  const doomed: string[] = []
  for await (const item of historySince(startTime, text)) {
    if (!item.url) continue
    if (isOwnPage(item.url) || (await matcher.matches(item.url))) doomed.push(item.url)
  }
  await deleteUrls(doomed)
}

/**
 * A protected URL was just visited: delete it, then everything else from the
 * same site (redirect hops, sub-pages) found by searching for its host.
 */
export async function handleVisited(url: string): Promise<void> {
  if (isOwnPage(url)) {
    await chrome.history.deleteUrl({url})
    return
  }
  const matcher = await getMatcher()
  if (matcher.isEmpty || !(await matcher.matches(url))) return
  await deleteUrls([url])
  const host = hostOf(url)
  if (host) await purgeMatching(matcher, 0, host)
}

/**
 * Newly protected entries: wipe their existing history. Hosts/URLs come from
 * the popup in memory only. The match table was written just before this
 * message, so read it fresh instead of trusting the cache.
 *
 * Besides what a search finds, the site's root (or the exact URL) is deleted
 * by address: typing the bare domain can leave only redirect hops behind,
 * which no search returns but the address bar still suggests.
 */
export async function purgeEntries(hosts: string[], urls: string[]): Promise<void> {
  invalidateMatcher()
  const matcher = await getMatcher()
  const terms = new Set<string>()
  for (const host of hosts) terms.add(host)
  for (const url of urls) {
    const host = hostOf(url)
    if (host) terms.add(host)
  }
  await deleteUrls([...hosts.map((host) => `https://${host}/`), ...urls])
  for (const term of terms) await purgeMatching(matcher, 0, term)
}

/** Full scan of all history (startup / install). */
export async function fullScan(): Promise<void> {
  const startedAt = Date.now()
  await purgeMatching(await getMatcher(), 0)
  await updateState((s) => ({...s, lastScanAt: startedAt}))
}

/** Scans only what was visited since the previous scan (with a small overlap). */
export async function incrementalScan(): Promise<void> {
  const startedAt = Date.now()
  const {lastScanAt} = await readState()
  await purgeMatching(await getMatcher(), Math.max(0, lastScanAt - 60_000))
  await updateState((s) => ({...s, lastScanAt: startedAt}))
}
