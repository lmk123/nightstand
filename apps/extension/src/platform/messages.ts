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
