/**
 * The page script's host permission: every http(s) page, asked for as one
 * block and only when the user turns covering on (it is optional in the
 * manifest). Never per site: per-site grants would list the protected sites
 * on the extension's details page. Nothing but the page script needs it;
 * history cleaning and muting work without it.
 */
export const PAGE_ORIGINS = ['http://*/*', 'https://*/*']

export function hasPageAccess(): Promise<boolean> {
  return chrome.permissions.contains({origins: PAGE_ORIGINS})
}

/**
 * Must be called straight from a click (no await before it). Chrome closes
 * the popup when its prompt opens, so the caller may never see the answer:
 * the background turns covering on once access is granted.
 */
export function requestPageAccess(): Promise<boolean> {
  return chrome.permissions.request({origins: PAGE_ORIGINS})
}

/** Fails when the permission is a required one (the e2e build grants it at install). */
export function removePageAccess(): Promise<boolean> {
  return chrome.permissions.remove({origins: PAGE_ORIGINS})
}
