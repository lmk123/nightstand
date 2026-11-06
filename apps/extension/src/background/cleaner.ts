import {createMatcher, emptyMatchTable, hostOf, type UrlMatcher} from '@nightstand/core'
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

async function deleteUrls(urls: Iterable<string>): Promise<number> {
  let count = 0
  for (const url of new Set(urls)) {
    await chrome.history.deleteUrl({url})
    count++
  }
  return count
}

/** Deletes every history item (optionally restricted to a text search) that matches. */
async function purgeMatching(matcher: UrlMatcher, startTime: number, text = ''): Promise<number> {
  const doomed: string[] = []
  for await (const item of historySince(startTime, text)) {
    if (!item.url) continue
    if (isOwnPage(item.url) || (await matcher.matches(item.url))) doomed.push(item.url)
  }
  return deleteUrls(doomed)
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
  await chrome.history.deleteUrl({url})
  const host = hostOf(url)
  if (host) await purgeMatching(matcher, 0, host)
}

/**
 * Newly protected entries: wipe their existing history. Hosts/URLs come from
 * the popup in memory only. The match table was written just before this
 * message, so read it fresh instead of trusting the cache.
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
