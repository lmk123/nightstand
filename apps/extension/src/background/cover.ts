import type {PageNotice, PageRequest} from '@/platform/messages'
import {loadPrefs, STORAGE_KEYS} from '@/platform/storage'
import {getMatcher} from './cleaner'

/**
 * Covering and muting protected pages. The page script (`content/cover.ts`)
 * draws the cover; this side mutes and unmutes tabs and remembers which tabs
 * the user chose to show, so that following a link within a shown page does
 * not cover it again, while switching away or leaving the window does.
 *
 * Per-tab state lives in `storage.session` (memory only, gone with the
 * browser session) because the service worker may stop between events:
 * - `covered`: on a protected page, not shown (muted when `mute` is on)
 * - `shown`: on a protected page the user chose to show
 * - absent: not on a protected page
 *
 * Only tab ids are kept, never URLs or hosts.
 */
type TabCover = 'covered' | 'shown'
type CoverMap = Record<string, TabCover>

const SESSION_KEY = 'tabs'

let queue: Promise<unknown> = Promise.resolve()

/** Serialized read-modify-write of the per-tab map (events arrive concurrently). */
function updateTabs<T>(change: (tabs: CoverMap) => T): Promise<T> {
  const run = queue.then(async () => {
    const tabs = await readTabs()
    const result = change(tabs)
    await chrome.storage.session.set({[SESSION_KEY]: tabs})
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

async function readTabs(): Promise<CoverMap> {
  const raw = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY]
  const tabs: CoverMap = {}
  if (raw && typeof raw === 'object') {
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === 'covered' || value === 'shown') tabs[id] = value
    }
  }
  return tabs
}

async function isProtected(url: string | undefined): Promise<boolean> {
  if (!url) return false
  const matcher = await getMatcher()
  return !matcher.isEmpty && (await matcher.matches(url))
}

async function mute(tabId: number): Promise<void> {
  if (!(await loadPrefs()).mute) return
  await chrome.tabs.update(tabId, {muted: true}).catch(() => undefined)
}

/** Unmutes only a mute Nightstand set: one the user chose stays. */
async function unmuteOurs(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined)
  const info = tab?.mutedInfo
  if (info?.muted && info.reason === 'extension' && info.extensionId === chrome.runtime.id) {
    await chrome.tabs.update(tabId, {muted: false}).catch(() => undefined)
  }
}

function notify(tabId: number, notice: PageNotice): void {
  chrome.tabs.sendMessage(tabId, notice).catch(() => {
    // No page script there (PDF, browser page, still loading): nothing to tell.
  })
}

/**
 * The tab's URL changed (new page, or the history API). Entering a protected
 * page from elsewhere mutes the tab; moving within protected pages keeps
 * whatever the user chose; leaving them undoes Nightstand's mute.
 */
async function onTabUrl(tabId: number, url: string): Promise<void> {
  const inside = await isProtected(url)
  const entered = await updateTabs((tabs) => {
    const before = tabs[tabId]
    if (!inside) {
      delete tabs[tabId]
      return before ? 'left' : 'none'
    }
    if (!before) tabs[tabId] = 'covered'
    return before ? 'none' : 'entered'
  })
  if (entered === 'entered') await mute(tabId)
  if (entered === 'left') await unmuteOurs(tabId)
  notify(tabId, {type: 'recheck'})
}

/** Covers every shown tab outside the focused window (WINDOW_ID_NONE: none is focused). */
async function onWindowFocus(windowId: number): Promise<void> {
  const tabs = await readTabs()
  const shown = Object.keys(tabs).filter((id) => tabs[id] === 'shown').map(Number)
  for (const id of shown) {
    const tab = await chrome.tabs.get(id).catch(() => undefined)
    if (!tab) continue
    if (tab.windowId === windowId) continue
    await coverTab(id)
  }
}

async function coverTab(tabId: number): Promise<void> {
  await updateTabs((tabs) => {
    if (tabs[tabId]) tabs[tabId] = 'covered'
  })
  await mute(tabId)
  notify(tabId, {type: 'cover'})
}

/**
 * Answers the page script about its own tab. `url` is the address of the
 * frame that sent it (the top frame), which the page script can't always
 * check itself: plain-http pages have no `crypto.subtle`. Anything about a
 * page that is not protected is ignored.
 */
export async function handlePageRequest(request: PageRequest, tabId: number, url: string | undefined): Promise<unknown> {
  if (!(await isProtected(url))) return {inside: false, shown: false}
  switch (request.type) {
    case 'pageQuery':
      return {inside: true, shown: (await readTabs())[tabId] === 'shown'}
    case 'pageShown':
      await updateTabs((tabs) => {
        tabs[tabId] = 'shown'
      })
      await unmuteOurs(tabId)
      return {}
    case 'pageCovered':
      await updateTabs((tabs) => {
        tabs[tabId] = 'covered'
      })
      await mute(tabId)
      return {}
  }
}

/**
 * Startup / install: tabs already open on protected pages (restored session,
 * or opened before Nightstand was installed) start covered and muted. Pages
 * loaded before an install or update have no page script, so only the mute
 * applies to them until they reload.
 */
export async function coverOpenTabs(): Promise<void> {
  const open = await chrome.tabs.query({})
  const inside: number[] = []
  for (const tab of open) {
    if (tab.id !== undefined && (await isProtected(tab.url ?? tab.pendingUrl))) inside.push(tab.id)
  }
  await updateTabs((tabs) => {
    for (const key of Object.keys(tabs)) delete tabs[key]
    for (const id of inside) tabs[id] = 'covered'
  })
  for (const id of inside) await mute(id)
}

/** The mute preference was turned off: undo every mute Nightstand set. */
async function unmuteAll(): Promise<void> {
  const tabs = await chrome.tabs.query({muted: true})
  for (const tab of tabs) if (tab.id !== undefined) await unmuteOurs(tab.id)
}

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url) onTabUrl(tabId, change.url).catch(console.error)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  updateTabs((tabs) => {
    delete tabs[tabId]
  }).catch(console.error)
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  onWindowFocus(windowId).catch(console.error)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(STORAGE_KEYS.prefs in changes)) return
  loadPrefs()
    .then((prefs) => (prefs.mute ? undefined : unmuteAll()))
    .catch(console.error)
})
