import type {Prefs} from '@nightstand/core'
import type {PageNotice, PageRequest} from '@/platform/messages'
import {loadPrefs, STORAGE_KEYS} from '@/platform/storage'
import {getMatcher, protectedTabIds} from './cleaner'

/**
 * Covering and muting protected pages. The page script (`content/cover.ts`)
 * draws the cover; this side mutes and unmutes tabs and remembers which tabs
 * the user chose to show, so that following a link within a shown page does
 * not cover it again, while switching away or leaving the window does.
 *
 * Per-tab state lives in `storage.session` (memory only, gone with the
 * browser session) because the service worker may stop between events:
 * - `covered`: on a protected page, not shown (muted when muting is on)
 * - `shown`: on a protected page the user chose to show
 * - absent: not on a protected page
 *
 * Only tab ids are kept, never URLs or hosts.
 */
type TabCover = 'covered' | 'shown'
type CoverMap = Record<string, TabCover>

const SESSION_KEY = 'tabs'

let queue: Promise<unknown> = Promise.resolve()

/**
 * Serialized read-modify-write of the per-tab map (events arrive
 * concurrently). Written back only when `change` altered it: this runs for
 * every navigation and closed tab, protected or not.
 */
function updateTabs<T>(change: (tabs: CoverMap) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const tabs = await readTabs()
    const before = JSON.stringify(tabs)
    const result = await change(tabs)
    if (JSON.stringify(tabs) !== before) await chrome.storage.session.set({[SESSION_KEY]: tabs})
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

/** Muting goes with the cover: with covering off, no page is ever shown, so it would never be undone. */
function mutes(prefs: Prefs): boolean {
  return prefs.cover && prefs.mute
}

async function mute(tabId: number, prefs?: Prefs): Promise<void> {
  if (!mutes(prefs ?? (await loadPrefs()))) return
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
 * whatever the user chose; leaving them undoes Nightstand's mute. The page
 * script is told only when the tab entered or left: anything else, its own
 * check at load (or its current state) already has right.
 */
async function onTabUrl(tabId: number, url: string): Promise<void> {
  const inside = await isProtected(url)
  const change = await updateTabs((tabs) => {
    const before = tabs[tabId]
    if (!inside) {
      delete tabs[tabId]
      return before ? 'left' : 'none'
    }
    if (!before) tabs[tabId] = 'covered'
    return before ? 'none' : 'entered'
  })
  if (change === 'none') return
  if (change === 'entered') await mute(tabId)
  else await unmuteOurs(tabId)
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

/** Covers a tab that is still showing a protected page (it may have left since the caller looked). */
async function coverTab(tabId: number): Promise<void> {
  const wasShown = await updateTabs((tabs) => {
    if (tabs[tabId] !== 'shown') return false
    tabs[tabId] = 'covered'
    return true
  })
  if (!wasShown) return
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
  const inside = await protectedTabIds()
  await updateTabs((tabs) => {
    for (const key of Object.keys(tabs)) delete tabs[key]
    for (const id of inside) tabs[id] = 'covered'
  })
  const prefs = await loadPrefs()
  for (const id of inside) await mute(id, prefs)
}

/**
 * The list changed: tabs whose page is no longer protected are forgotten and
 * unmuted (their page script uncovers itself on the same change). Newly
 * protected open pages are left as they are, like the page script does.
 * The matcher is fresh here: the cleaner drops its cache on the same event,
 * and its listener was added first (this module imports it).
 */
async function releaseTabs(): Promise<void> {
  const released = await updateTabs(async (tabs) => {
    const gone: number[] = []
    for (const key of Object.keys(tabs)) {
      const tab = await chrome.tabs.get(Number(key)).catch(() => undefined)
      if (tab && (await isProtected(tab.url ?? tab.pendingUrl))) continue
      delete tabs[key]
      if (tab) gone.push(Number(key))
    }
    return gone
  })
  for (const id of released) await unmuteOurs(id)
}

/** Muting (or covering) was turned off: undo every mute Nightstand set. */
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
  if (area !== 'local') return
  if (STORAGE_KEYS.index in changes) releaseTabs().catch(console.error)
  if (STORAGE_KEYS.prefs in changes) {
    loadPrefs()
      .then((prefs) => (mutes(prefs) ? undefined : unmuteAll()))
      .catch(console.error)
  }
})
