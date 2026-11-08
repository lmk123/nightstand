import {updateState} from './state'

/**
 * Opens a URL in a new incognito (Chromium) / private (Firefox) window and
 * remembers the window so panic can close it. Done here rather than in the
 * popup because the popup closes as soon as the new window takes focus.
 */
export async function openIncognito(url: string): Promise<void> {
  const win = await chrome.windows.create({url, incognito: true, focused: true})
  const id = win?.id
  if (id === undefined) return
  await updateState((s) => ({...s, incognitoWindows: [...s.incognitoWindows, id]}))
}

/** Drops every recorded window (a new browser session reuses window ids). */
export async function forgetIncognitoWindows(): Promise<void> {
  await updateState((s) => (s.incognitoWindows.length ? {...s, incognitoWindows: []} : s))
}

chrome.windows.onRemoved.addListener((windowId) => {
  updateState((s) =>
    s.incognitoWindows.includes(windowId)
      ? {...s, incognitoWindows: s.incognitoWindows.filter((id) => id !== windowId)}
      : s
  ).catch(console.error)
})
