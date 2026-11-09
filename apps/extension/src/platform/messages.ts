/**
 * Messages between the popup and the background. Plaintext hosts/URLs travel
 * only in memory (runtime messaging) and are never persisted. The vault key
 * is never sent.
 */
export type BackgroundRequest =
  /** Delete existing history for newly protected sites / exact URLs. */
  | {type: 'purge'; hosts: string[]; urls: string[]}
  /** Open a URL in a new incognito/private window and remember that window for panic. */
  | {type: 'openIncognito'; url: string}

/** Background → popup. */
export type PopupNotice = {type: 'panic'}

/**
 * Page script (content script on every http(s) page) → background. Only the
 * tab that sent it is ever affected, and only while it is on a protected
 * page (the background checks the tab's URL itself).
 */
export type PageRequest =
  /**
   * Is this page protected, and was this tab showing a protected page
   * already? Reply: `{inside: boolean, shown: boolean}`.
   */
  | {type: 'pageQuery'}
  /** The user chose to show the page: unmute the tab. */
  | {type: 'pageShown'}
  /** The page covered itself again (tab hidden, idle): mute the tab. */
  | {type: 'pageCovered'}
  /**
   * The page has gone without input for the idle time: is its tab playing
   * sound? (Then it stays shown.) Reply adds `playing`.
   */
  | {type: 'pagePlaying'}

/**
 * Background → page script, the answer to every `PageRequest`. `{}` means
 * the background couldn't tell: the page script keeps the page covered.
 */
export type PageReply = {inside: boolean; shown: boolean; playing?: boolean} | Record<string, never>

/** Background → page script. */
export type PageNotice =
  /** Cover now (the browser window lost focus). */
  | {type: 'cover'}
  /** The tab's URL changed without a new document (history API): match again. */
  | {type: 'recheck'}

export function isPageRequest(message: unknown): message is PageRequest {
  const type = (message as {type?: unknown} | null)?.type
  return type === 'pageQuery' || type === 'pageShown' || type === 'pageCovered' || type === 'pagePlaying'
}

export function isPageNotice(message: unknown): message is PageNotice {
  const type = (message as {type?: unknown} | null)?.type
  return type === 'cover' || type === 'recheck'
}

export function sendToBackground(request: BackgroundRequest): Promise<unknown> {
  return chrome.runtime.sendMessage(request)
}

export function isBackgroundRequest(message: unknown): message is BackgroundRequest {
  const type = (message as {type?: unknown} | null)?.type
  return type === 'purge' || type === 'openIncognito'
}

export function isPopupNotice(message: unknown): message is PopupNotice {
  return (message as {type?: unknown} | null)?.type === 'panic'
}
