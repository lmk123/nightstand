// Background: service worker on Chromium, event page on Firefox.
//
// Cleans history for protected sites (also while the vault is locked, using
// only the hashed match table), mutes protected tabs and answers the page
// script that covers them, and handles the panic shortcut. It never sees the
// vault key.
import {applyIcon} from '@/platform/icons'
import {isBackgroundRequest, isPageRequest, type PageReply} from '@/platform/messages'
import {loadLinks, removeRetiredKeys} from '@/platform/storage'
import {fullScan, handleVisited, incrementalScan, isOwnPage, purgeEntries} from './cleaner'
import {coverOpenTabs, handlePageRequest} from './cover'
import {panic} from './panic'

const SCAN_ALARM = 'scan'
const SCAN_PERIOD_MINUTES = 15

chrome.history.onVisited.addListener((item) => {
  if (item.url) handleVisited(item.url).catch(console.error)
})

/** Sent from one of Nightstand's own pages (the popup), not a page script on a website. */
function fromOwnPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.url !== undefined && isOwnPage(sender.url)
}

/**
 * The page script runs only in a tab's top frame, whose `frameId` is 0. A
 * page Chrome is prerendering has another `frameId` and gets no answer: its
 * page script stays covered and asks again once the page is activated.
 */
function fromTopFrame(sender: chrome.runtime.MessageSender): boolean {
  return sender.frameId === 0
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  // The page script may only ask about the tab it runs in.
  if (!fromOwnPage(sender)) {
    const tabId = sender.tab?.id
    if (tabId === undefined || !fromTopFrame(sender) || !isPageRequest(message)) return
    handlePageRequest(message, tabId, sender.url).then(sendResponse, (error: unknown) => {
      console.error(error)
      // Can't tell: the page script keeps the page covered.
      sendResponse({} satisfies PageReply)
    })
    return true
  }
  // Everything else only from our own popup.
  if (!isBackgroundRequest(message)) return
  purgeEntries(message.hosts, message.urls).then(
    () => sendResponse({ok: true}),
    (error: unknown) => {
      console.error(error)
      sendResponse({ok: false})
    }
  )
  return true
})

chrome.commands.onCommand.addListener((command) => {
  if (command === 'panic') panic().catch(console.error)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SCAN_ALARM) incrementalScan().catch(console.error)
})

async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get(SCAN_ALARM))) {
    await chrome.alarms.create(SCAN_ALARM, {periodInMinutes: SCAN_PERIOD_MINUTES})
  }
}

/** Re-applies the chosen toolbar icon (setIcon does not survive every restart). */
async function restoreIcon(): Promise<void> {
  const {icon} = await loadLinks()
  if (icon !== 'nightstand') await applyIcon(icon)
}

chrome.runtime.onStartup.addListener(() => {
  restoreIcon().catch(console.error)
  ensureAlarm().catch(console.error)
  coverOpenTabs().catch(console.error)
  fullScan().catch(console.error)
})

chrome.runtime.onInstalled.addListener(({reason}) => {
  removeRetiredKeys().catch(console.error)
  restoreIcon().catch(console.error)
  ensureAlarm().catch(console.error)
  // Not after an update: pages loaded before it keep a page script that can
  // no longer reach the background, so a mute set now could not be undone
  // from their "Show page" (or ever, on a page already shown).
  if (reason !== 'update') coverOpenTabs().catch(console.error)
  fullScan().catch(console.error)
})
