import type {PopupNotice} from '@/platform/messages'
import {fullScan, getMatcher} from './cleaner'
import {readState, updateState} from './state'

/**
 * Panic shortcut: close every tab on a protected site and every incognito
 * window Nightstand opened, clean history right away, and tell an open popup
 * to close (which locks it).
 */
export async function panic(): Promise<void> {
  // Close the popup first: it is the most visible thing on screen.
  const notice: PopupNotice = {type: 'panic'}
  chrome.runtime.sendMessage(notice).catch(() => {
    // No popup open: nothing to close.
  })

  const {incognitoWindows} = await readState()
  await Promise.all(
    incognitoWindows.map((id) => chrome.windows.remove(id).catch(() => undefined))
  )
  await updateState((s) => ({...s, incognitoWindows: []}))

  const matcher = await getMatcher()
  if (!matcher.isEmpty) {
    const tabs = await chrome.tabs.query({})
    const doomed: number[] = []
    for (const tab of tabs) {
      const url = tab.url ?? tab.pendingUrl
      if (tab.id !== undefined && url && (await matcher.matches(url))) doomed.push(tab.id)
    }
    if (doomed.length) await chrome.tabs.remove(doomed).catch(console.error)
  }

  await fullScan()
}
