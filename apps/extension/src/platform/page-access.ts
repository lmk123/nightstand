/**
 * The page script's host permission: every http(s) page, asked for as one
 * block and only when the user first turns covering on (it is optional in the
 * manifest), then kept. Never per site: per-site grants would list the
 * protected sites on the extension's details page. Nothing but the page
 * script needs it; history cleaning and muting work without it.
 */
export const PAGE_ORIGINS = ['http://*/*', 'https://*/*']

/**
 * Set in `storage.session` while a request of the popup's is open, so the
 * background turns covering on only for a grant given in answer to it: the
 * block stays granted while covering is off, and granting it again some other
 * way (the extension menu's site access, the details page) must not turn
 * covering back on. Left set if Chrome closes the popup and the user refuses;
 * gone with the browser session.
 */
const ASKED_KEY = 'asked'

export function hasPageAccess(): Promise<boolean> {
  return chrome.permissions.contains({origins: PAGE_ORIGINS})
}

/**
 * Must be called straight from a click (no await before it). Chrome closes
 * the popup when its prompt opens, so the caller may never see the answer:
 * the background turns covering on once access is granted. Already granted,
 * it answers at once without asking.
 */
export function requestPageAccess(): Promise<boolean> {
  // Not awaited: the request must stay in the click. The write is issued first, so it lands before any answer.
  const marked = chrome.storage.session.set({[ASKED_KEY]: true})
  const answer = chrome.permissions.request({origins: PAGE_ORIGINS})
  // An answer that reaches the popup is acted on there, not by the background.
  const close = () => marked.then(() => chrome.storage.session.remove(ASKED_KEY)).catch(console.error)
  answer.then(close, close)
  return answer
}

/** For the background: whether a request of the popup's was open, closing it. */
export async function takePageAccessRequest(): Promise<boolean> {
  const asked = (await chrome.storage.session.get(ASKED_KEY))[ASKED_KEY] === true
  if (asked) await chrome.storage.session.remove(ASKED_KEY)
  return asked
}
