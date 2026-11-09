import type {PopupNotice} from '@/platform/messages'
import {fullScan, protectedTabIds} from './cleaner'

/**
 * Panic shortcut: close every tab on a protected site, clean history right
 * away, and tell an open popup to close (which locks it).
 */
export async function panic(): Promise<void> {
  // Close the popup first: it is the most visible thing on screen.
  const notice: PopupNotice = {type: 'panic'}
  chrome.runtime.sendMessage(notice).catch(() => {
    // No popup open: nothing to close.
  })

  const doomed = await protectedTabIds()
  if (doomed.length) await chrome.tabs.remove(doomed).catch(console.error)

  await fullScan()
}
