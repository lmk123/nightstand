import {parsePrefs, type Prefs} from '@nightstand/core'
import type {PageNotice, PageReply, PageRequest} from '@/platform/messages'
import {loadPrefs, STORAGE_KEYS} from '@/platform/storage'
import {getMatcher, isProtectedTab, protectedTabIds} from './cleaner'

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
 * - absent: not on a protected page, or covering is off
 *
 * Only tab ids are kept, never URLs or hosts.
 */
type TabCover = 'covered' | 'shown'
type CoverMap = Record<string, TabCover>

const SESSION_KEY = 'tabs'

/**
 * In-memory copy of the map in `storage.session`, so that the many
 * navigations that don't touch it cost no storage read. Only this module
 * writes the map, always through the queue; a restarted worker reads it again.
 */
let mirror: CoverMap | null = null

let queue: Promise<unknown> = Promise.resolve()

/**
 * Serialized read-modify-write of the per-tab map (events arrive
 * concurrently). The muting that goes with a change happens inside `change`
 * too, so that two changes to one tab can't land their mutes out of order.
 * Written back only when `change` altered the map.
 */
function updateTabs<T>(change: (tabs: CoverMap) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    mirror ??= await readTabs()
    const tabs = {...mirror}
    const result = await change(tabs)
    if (!sameTabs(tabs, mirror)) {
      await chrome.storage.session.set({[SESSION_KEY]: tabs})
      mirror = tabs
    }
    return result
  })
  queue = run.catch(() => undefined)
  return run
}

function sameTabs(a: CoverMap, b: CoverMap): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
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

let prefsPromise: Promise<Prefs> | null = null

/** Cached preferences, dropped when they change. A failed load is not kept. */
function getPrefs(): Promise<Prefs> {
  if (!prefsPromise) {
    const loading = loadPrefs()
    prefsPromise = loading
    loading.catch(() => {
      if (prefsPromise === loading) prefsPromise = null
    })
  }
  return prefsPromise
}

/** A page at `url` is covered: covering is on and the address is protected. */
async function covers(url: string | undefined): Promise<boolean> {
  if (!url || !(await getPrefs()).cover) return false
  const matcher = await getMatcher()
  return !matcher.isEmpty && (await matcher.matches(url))
}

/** Muting goes with the cover: with covering off, no page is ever shown, so it would never be undone. */
function mutes(prefs: Prefs): boolean {
  return prefs.cover && prefs.mute
}

async function mute(tabId: number): Promise<void> {
  if (!mutes(await getPrefs())) return
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
  const inside = await covers(url)
  const changed = await updateTabs(async (tabs) => {
    const before = tabs[tabId]
    if (inside === Boolean(before)) return false
    if (inside) {
      tabs[tabId] = 'covered'
      await mute(tabId)
    } else {
      delete tabs[tabId]
      await unmuteOurs(tabId)
    }
    return true
  })
  if (changed) notify(tabId, {type: 'recheck'})
}

/** Covers every shown tab outside the focused window (WINDOW_ID_NONE: none is focused). */
async function onWindowFocus(windowId: number): Promise<void> {
  const shown = await updateTabs((tabs) =>
    Object.keys(tabs)
      .filter((id) => tabs[id] === 'shown')
      .map(Number)
  )
  for (const id of shown) {
    const tab = await chrome.tabs.get(id).catch(() => undefined)
    if (!tab) continue
    if (tab.windowId === windowId) continue
    await coverTab(id)
  }
}

/** Covers a tab that is still showing a protected page (it may have left since the caller looked). */
async function coverTab(tabId: number): Promise<void> {
  const wasShown = await updateTabs(async (tabs) => {
    if (tabs[tabId] !== 'shown') return false
    tabs[tabId] = 'covered'
    await mute(tabId)
    return true
  })
  if (wasShown) notify(tabId, {type: 'cover'})
}

/**
 * Answers the page script about its own tab. `url` is the address of the
 * frame that sent it (the top frame), which the page script can't always
 * check itself: plain-http pages have no `crypto.subtle`. Anything about a
 * page that is not covered is ignored.
 */
export async function handlePageRequest(request: PageRequest, tabId: number, url: string | undefined): Promise<PageReply> {
  if (!(await covers(url))) return {inside: false, shown: false}
  switch (request.type) {
    case 'pageQuery':
      // Through the queue: a change already under way (the window lost
      // focus, a navigation) is answered as it ends, not as it began.
      return {inside: true, shown: await updateTabs((tabs) => tabs[tabId] === 'shown')}
    case 'pageShown':
      await updateTabs(async (tabs) => {
        tabs[tabId] = 'shown'
        await unmuteOurs(tabId)
      })
      return {inside: true, shown: true}
    case 'pageCovered':
      await updateTabs(async (tabs) => {
        tabs[tabId] = 'covered'
        await mute(tabId)
      })
      return {inside: true, shown: false}
  }
}

/**
 * Startup / install: tabs already open on protected pages (restored session,
 * or opened before Nightstand was installed) start covered and muted. Pages
 * loaded before an install have no page script, so only the mute applies to
 * them until they reload. (Not after an update: see the caller.)
 */
export async function coverOpenTabs(): Promise<void> {
  const inside = (await getPrefs()).cover ? await protectedTabIds() : []
  await updateTabs(async (tabs) => {
    for (const key of Object.keys(tabs)) delete tabs[key]
    for (const id of inside) {
      tabs[id] = 'covered'
      await mute(id)
    }
  })
}

/**
 * The list changed: tabs whose page is no longer protected are forgotten and
 * unmuted (their page script uncovers itself on the same change). Newly
 * protected open pages are left as they are, like the page script does.
 * The matcher is fresh here: the cleaner drops its cache on the same event,
 * and its listener was added first (this module imports it).
 */
async function releaseTabs(): Promise<void> {
  await updateTabs(async (tabs) => {
    for (const key of Object.keys(tabs)) {
      const tab = await chrome.tabs.get(Number(key)).catch(() => undefined)
      if (tab && (await isProtectedTab(tab))) continue
      delete tabs[key]
      if (tab) await unmuteOurs(Number(key))
    }
  })
}

/** Undoes every mute Nightstand set. */
async function unmuteAll(): Promise<void> {
  const tabs = await chrome.tabs.query({muted: true})
  for (const tab of tabs) if (tab.id !== undefined) await unmuteOurs(tab.id)
}

/**
 * Covering off: every mute goes and every tab is forgotten (their page
 * scripts uncover themselves; turned on again, open pages stay as they are
 * until they load again, like newly protected ones). Muting off: every mute
 * goes. Muting back on (covering on): covered tabs are muted again.
 */
async function onPrefsChange(before: Prefs, after: Prefs): Promise<void> {
  await updateTabs(async (tabs) => {
    if (!after.cover) {
      for (const key of Object.keys(tabs)) delete tabs[key]
      await unmuteAll()
    } else if (!after.mute) {
      await unmuteAll()
    } else if (!mutes(before)) {
      for (const [key, value] of Object.entries(tabs)) if (value === 'covered') await mute(Number(key))
    }
  })
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
  const prefs = changes[STORAGE_KEYS.prefs]
  if (prefs) {
    prefsPromise = null
    onPrefsChange(parsePrefs(prefs.oldValue), parsePrefs(prefs.newValue)).catch(console.error)
  }
})
