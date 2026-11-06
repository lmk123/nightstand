// Background: service worker on Chromium, event page on Firefox.
//
// Cleans history for protected sites (also while the vault is locked, using
// only the hashed match table), opens incognito windows for the popup, and
// handles the panic shortcut. It never sees the vault key.
import {applyIcon} from '@/platform/icons'
import {isBackgroundRequest} from '@/platform/messages'
import {loadLinks} from '@/platform/storage'
import {fullScan, handleVisited, incrementalScan, purgeEntries} from './cleaner'
import {openIncognito} from './incognito'
import {panic} from './panic'

const SCAN_ALARM = 'scan'
const SCAN_PERIOD_MINUTES = 15

chrome.history.onVisited.addListener((item) => {
  if (item.url) handleVisited(item.url).catch(console.error)
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own popup may ask for anything.
  if (sender.id !== chrome.runtime.id || !isBackgroundRequest(message)) return
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
  restoreIcon().catch(console.error)
  ensureAlarm().catch(console.error)
  fullScan().catch(console.error)
})

chrome.runtime.onInstalled.addListener(() => {
  restoreIcon().catch(console.error)
  ensureAlarm().catch(console.error)
  fullScan().catch(console.error)
})
