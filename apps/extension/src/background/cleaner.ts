import {addressVariants, createMatcher, emptyMatchTable, hostOf, type UrlMatcher} from '@nightstand/core'
import {historySince} from '@/platform/history'
import {loadIndex, STORAGE_KEYS} from '@/platform/storage'
import {readState, updateState} from './state'

/**
 * History cleanup. Works while the vault is locked: it only ever uses the
 * hashed match table (`index`), never the vault or its key.
 */

let matcherPromise: Promise<UrlMatcher> | null = null

/** Cached matcher; dropped whenever the popup rewrites the match table. */
export function getMatcher(): Promise<UrlMatcher> {
  matcherPromise ??= loadIndex().then((table) => createMatcher(table ?? emptyMatchTable()))
  return matcherPromise
}

export function invalidateMatcher(): void {
  matcherPromise = null
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && STORAGE_KEYS.index in changes) invalidateMatcher()
})

/** Nightstand's own pages (popup) must never linger in history either. */
const OWN_ORIGIN = new URL(chrome.runtime.getURL('/')).origin

function isOwnPage(url: string): boolean {
  return url.startsWith(`${OWN_ORIGIN}/`)
}

/**
 * Deletes each URL together with its scheme / `www.` variants: redirect hops
 * of the same visit that `history.search` can't see (see `addressVariants`).
 * Deleting an address that isn't in history is a no-op.
 */
async function deleteUrls(urls: Iterable<string>): Promise<void> {
  const doomed = new Set<string>()
  for (const url of urls) {
    doomed.add(url)
    for (const variant of addressVariants(url)) doomed.add(variant)
  }
  for (const url of doomed) await chrome.history.deleteUrl({url})
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
