// Background: service worker on Chromium, event page on Firefox.
//
// Cleans history for protected sites (also while the vault is locked, using
// only the hashed match table), mutes protected tabs and answers the page
// script that covers them, opens incognito windows for the popup, and
// handles the panic shortcut. It never sees the vault key.
import {applyIcon} from '@/platform/icons'
import {isBackgroundRequest, isPageRequest} from '@/platform/messages'
import {loadLinks, removeRetiredKeys} from '@/platform/storage'
import {fullScan, handleVisited, incrementalScan, purgeEntries} from './cleaner'
import {coverOpenTabs, handlePageRequest} from './cover'
import {forgetIncognitoWindows, openIncognito} from './incognito'
import {panic} from './panic'

const SCAN_ALARM = 'scan'
const SCAN_PERIOD_MINUTES = 15

chrome.history.onVisited.addListener((item) => {
  if (item.url) handleVisited(item.url).catch(console.error)
})

const OWN_ORIGIN = new URL(chrome.runtime.getURL('/')).origin

/** Sent from one of Nightstand's own pages (the popup), not a page script on a website. */
function fromOwnPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.startsWith(`${OWN_ORIGIN}/`) ?? false
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return
  // The page script may only ask about the tab it runs in.
  if (!fromOwnPage(sender)) {
    const tabId = sender.tab?.id
    if (tabId === undefined || sender.frameId !== 0 || !isPageRequest(message)) return
    handlePageRequest(message, tabId, sender.url).then(sendResponse, (error: unknown) => {
      console.error(error)
      sendResponse({inside: false, shown: false})
    })
    return true
  }
  // Everything else only from our own popup.
  if (!isBackgroundRequest(message)) return
  const work =
    message.type === 'purge'
      ? purgeEntries(message.hosts, message.urls)
      : openIncognito(message.url)
  work.then(
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
  // Window ids start over with every browser session, and windows still open
  // when the browser quit never reported being closed: forget them all, so
  // panic can't close an ordinary window that now has one of those ids.
  forgetIncognitoWindows().catch(console.error)
  restoreIcon().catch(console.error)
  ensureAlarm().catch(console.error)
  coverOpenTabs().catch(console.error)
  fullScan().catch(console.error)
})

chrome.runtime.onInstalled.addListener(() => {
  removeRetiredKeys().catch(console.error)
  restoreIcon().catch(console.error)
  ensureAlarm().catch(console.error)
  coverOpenTabs().catch(console.error)
  fullScan().catch(console.error)
})
