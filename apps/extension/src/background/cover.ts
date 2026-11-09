import {parsePrefs, type Prefs} from '@nightstand/core'
import type {PageNotice, PageReply, PageRequest} from '@/platform/messages'
import {loadPrefs, STORAGE_KEYS} from '@/platform/storage'
import {cached} from './cached'
import {getMatcher, invalidateMatcher, isProtectedTab, protectedTabs} from './cleaner'

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

/** Cached preferences, dropped when they change. */
const prefsCache = cached(loadPrefs)
const getPrefs = prefsCache.get

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

/**
 * Mutes a tab that isn't muted yet. An existing mute is left alone: muting
 * again would make it Nightstand's (`mutedInfo.reason`), and showing the page
 * would then undo a mute the user chose.
 */
async function mute(tabOrId: chrome.tabs.Tab | number): Promise<void> {
  if (!mutes(await getPrefs())) return
  const tab = typeof tabOrId === 'number' ? await chrome.tabs.get(tabOrId).catch(() => undefined) : tabOrId
  if (tab?.id === undefined || tab.mutedInfo?.muted) return
  await chrome.tabs.update(tab.id, {muted: true}).catch(() => undefined)
}

function isOurMute(tab: chrome.tabs.Tab | undefined): boolean {
  const info = tab?.mutedInfo
  return info?.muted === true && info.reason === 'extension' && info.extensionId === chrome.runtime.id
}

/** Unmutes only a mute Nightstand set: one the user chose stays. */
async function unmuteOurs(tabOrId: chrome.tabs.Tab | number): Promise<void> {
  const tab = typeof tabOrId === 'number' ? await chrome.tabs.get(tabOrId).catch(() => undefined) : tabOrId
  if (tab?.id !== undefined && isOurMute(tab)) {
    await chrome.tabs.update(tab.id, {muted: false}).catch(() => undefined)
  }
}

/** The open tabs by id, in one lookup. */
async function openTabs(): Promise<Map<number, chrome.tabs.Tab>> {
  const open = new Map<number, chrome.tabs.Tab>()
  for (const tab of await chrome.tabs.query({})) if (tab.id !== undefined) open.set(tab.id, tab)
  return open
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
 *
 * A tab outside protected pages with no record can still carry a mute of
 * Nightstand's: an extension update clears `storage.session` but not the
 * mutes. `tab` (from the event) says so without another lookup.
 *
 * Matched inside the queue, so a preferences or list change queued meanwhile
 * isn't undone by a decision made before it.
 */
async function onTabUrl(tabId: number, url: string, tab: chrome.tabs.Tab): Promise<void> {
  const changed = await updateTabs(async (tabs) => {
    const inside = await covers(url)
    const before = tabs[tabId]
    if (inside === Boolean(before)) {
      if (!inside && isOurMute(tab)) await unmuteOurs(tabId)
      return false
    }
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
  const covered = await updateTabs(async (tabs) => {
    const ids: number[] = []
    const shown = Object.keys(tabs).filter((key) => tabs[key] === 'shown')
    if (!shown.length) return ids
    const open = await openTabs()
    for (const key of shown) {
      const tab = open.get(Number(key))
      if (tab?.id === undefined || tab.windowId === windowId) continue
      tabs[key] = 'covered'
      await mute(tab)
      ids.push(tab.id)
    }
    return ids
  })
  for (const id of covered) notify(id, {type: 'cover'})
}

/**
 * Answers the page script about its own tab. `url` is the address of the
 * frame that sent it (the top frame), which the page script can't always
 * check itself: plain-http pages have no `crypto.subtle`. Anything about a
 * page that is not covered is ignored.
 *
 * Handled through the queue: a change already under way (the window lost
 * focus, a navigation) is answered as it ends, not as it began. The tab's
 * current address must be covered too: a message from the page the tab is
 * leaving (sent just before the next page committed) must not mark or mute
 * a tab that has already moved off protected pages. That case gets "can't
 * tell", which no page script reads as "not protected".
 *
 * Queued as soon as it arrives, before any matching: matching awaits hashes,
 * which don't finish in order, so a "shown" followed at once by "covered"
 * (Show page, then a tab switch) could otherwise reach the map reversed.
 */
export function handlePageRequest(request: PageRequest, tabId: number, url: string | undefined): Promise<PageReply> {
  return updateTabs(async (tabs): Promise<PageReply> => {
    if (!(await covers(url))) return {inside: false, shown: false}
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    if (!tab || !(await covers(tab.url))) return {}
    switch (request.type) {
      case 'pageQuery':
        return {inside: true, shown: tabs[tabId] === 'shown'}
      case 'pageShown':
        tabs[tabId] = 'shown'
        await unmuteOurs(tab)
        return {inside: true, shown: true}
      case 'pageCovered':
        tabs[tabId] = 'covered'
        await mute(tab)
        return {inside: true, shown: false}
      case 'pagePlaying':
        // Sound over the last couple of seconds, from any frame (an embedded
        // player too), even with the tab muted. A video playing silently
        // doesn't count, so neither does a muted looping background video.
        // When it stops, `onTabQuiet` tells the page.
        return {inside: true, shown: tabs[tabId] === 'shown', playing: tab.audible === true}
    }
  })
}

/**
 * Startup / install: tabs already open on protected pages (restored session,
 * or opened before Nightstand was installed) start covered and muted. Pages
 * loaded before an install have no page script, so only the mute applies to
 * them until they reload. (Not after an update: see the caller.)
 *
 * A tab that already has a record keeps it: its page script got there first
 * (a restored page loads while the browser starts), and the user may have
 * shown it already. Records of tabs no longer on protected pages go.
 */
export async function coverOpenTabs(): Promise<void> {
  await updateTabs(async (tabs) => {
    // Looked up inside the queue, so no change in between is overwritten.
    const inside = (await getPrefs()).cover ? await protectedTabs() : []
    const keep = new Set(inside.map((tab) => String(tab.id)))
    for (const key of Object.keys(tabs)) if (!keep.has(key)) delete tabs[key]
    for (const tab of inside) {
      if (tab.id === undefined || tabs[tab.id]) continue
      tabs[tab.id] = 'covered'
      await mute(tab)
    }
  })
}

/**
 * The list changed: tabs whose page is no longer protected are forgotten and
 * unmuted (their page script uncovers itself on the same change). Newly
 * protected open pages are left as they are, like the page script does.
 * The caller drops the cached matcher first.
 */
async function releaseTabs(): Promise<void> {
  await updateTabs(async (tabs) => {
    const keys = Object.keys(tabs)
    if (!keys.length) return
    const open = await openTabs()
    for (const key of keys) {
      const tab = open.get(Number(key))
      if (tab && (await isProtectedTab(tab))) continue
      delete tabs[key]
      if (tab) await unmuteOurs(tab)
    }
  })
}

/** Undoes every mute Nightstand set. */
async function unmuteAll(): Promise<void> {
  const tabs = await chrome.tabs.query({muted: true})
  for (const tab of tabs) await unmuteOurs(tab)
}

/**
 * Covering off: every mute goes and every tab is forgotten (their page
 * scripts uncover themselves; turned on again, open pages stay as they are
 * until they load again, like newly protected ones). Muting off: every mute
 * goes. Muting back on (covering on): covered tabs are muted again.
 */
async function onPrefsChange(before: Prefs, after: Prefs): Promise<void> {
  // The idle time is the page script's alone.
  if (before.cover === after.cover && before.mute === after.mute) return
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

/**
 * A tab stopped playing sound: if it is a shown protected page, its page
 * script may be waiting for that past its idle time (see `pagePlaying`).
 * Told rather than asked over and over, so a long video doesn't keep the
 * worker awake.
 */
async function onTabQuiet(tabId: number): Promise<void> {
  if (await updateTabs((tabs) => tabs[tabId] === 'shown')) notify(tabId, {type: 'quiet'})
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url) onTabUrl(tabId, change.url, tab).catch(console.error)
  if (change.audible === false) onTabQuiet(tabId).catch(console.error)
})

function forgetTab(tabId: number): void {
  updateTabs((tabs) => {
    delete tabs[tabId]
  }).catch(console.error)
}

chrome.tabs.onRemoved.addListener(forgetTab)

// A tab swapped for another (new id): the old id's record goes with it. The
// new tab's page script reports its own state, covered unless shown again.
chrome.tabs.onReplaced.addListener((_addedTabId, removedTabId) => forgetTab(removedTabId))

chrome.windows.onFocusChanged.addListener((windowId) => {
  onWindowFocus(windowId).catch(console.error)
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (STORAGE_KEYS.index in changes) {
    // The cleaner drops it on the same event too; dropping it here as well
    // keeps this correct whichever listener runs first.
    invalidateMatcher()
    releaseTabs().catch(console.error)
  }
  const prefs = changes[STORAGE_KEYS.prefs]
  if (prefs) {
    prefsCache.invalidate()
    onPrefsChange(parsePrefs(prefs.oldValue), parsePrefs(prefs.newValue)).catch(console.error)
  }
})
