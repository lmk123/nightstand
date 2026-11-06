import {entryCoversUrl, hostOf, type VaultEntry} from '@nightstand/core'

const SEARCH_PAGE = 1000

/**
 * Every history item visited in [startTime, now], newest first, paging
 * backwards through `endTime` because `history.search` caps each call.
 */
export async function* historySince(startTime: number, text = ''): AsyncGenerator<chrome.history.HistoryItem> {
  const seen = new Set<string>()
  let endTime = Date.now() + 1
  for (;;) {
    const page = await chrome.history.search({text, startTime, endTime, maxResults: SEARCH_PAGE})
    let fresh = 0
    let oldest = endTime
    for (const item of page) {
      oldest = Math.min(oldest, item.lastVisitTime ?? oldest)
      if (seen.has(item.id)) continue
      seen.add(item.id)
      fresh++
      yield item
    }
    if (page.length < SEARCH_PAGE || fresh === 0) return
    // Items sharing the boundary timestamp are de-duplicated by id above.
    endTime = oldest + 1
  }
}

/**
 * How many pages (distinct URLs) in history the entry covers — what saving it
 * is about to delete. Searches by host, exactly like the background purge.
 */
export async function countHistoryFor(entry: VaultEntry): Promise<number> {
  const host = hostOf(entry.url)
  if (!host) return 0
  let count = 0
  for await (const item of historySince(0, host)) {
    if (item.url && entryCoversUrl(entry, item.url)) count++
  }
  return count
}
