import {compareVersions, parsePrefs} from '@nightstand/core'
import {isChromiumLike} from '@/lib/browser'
import {serialQueue} from '@/lib/concurrency'
import {hasPageAccess, PAGE_ORIGINS, takePageAccessRequest} from '@/platform/page-access'
import {loadPrefs, STORAGE_KEYS, updatePrefs} from '@/platform/storage'

/**
 * Registers the page script (`scripts/cover.ts`) only while covering is on
 * and its optional all-sites permission is granted; not declared in the
 * manifest, which would make that permission a required one. The permission
 * and `prefs.cover` are kept in step here: a grant in answer to the popup's
 * request turns covering on (Chrome closes the popup when its prompt opens),
 * a withdrawal turns it off, and install / update / startup reconcile the
 * two. Turning covering off keeps the permission.
 *
 * A registration only reaches pages loaded after it, so turning covering on
 * also injects the script into the open http(s) tabs: their protected pages
 * cover at once, as on load, instead of only after a reload.
 */
const SCRIPT_ID = 'cover'

const SCRIPT_FILE = 'scripts/cover.js'

/**
 * The last version whose page script can't be told to step back: after a
 * Chromium update from it, those copies keep running in the open tabs.
 */
const LAST_LEGACY_VERSION = '0.3.0'

const SCRIPT: chrome.scripting.RegisteredContentScript = {
  id: SCRIPT_ID,
  js: [SCRIPT_FILE],
  matches: PAGE_ORIGINS,
  runAt: 'document_start',
  allFrames: false,
  persistAcrossSessions: true
}

/** One change at a time: a permission event and a preferences change can arrive together. */
const serial = serialQueue()

/**
 * A registration that is already there is rewritten too: it persists across
 * sessions (and may across updates), so it can come from an older build
 * whose script or options differ. Registering it anew, or after an update
 * (open tabs still run the old build's copy, cut off from this background),
 * injects it into the open tabs as well, without waiting: a tab that can't
 * run it now (a page showing `alert()`) would hold up every change queued
 * after this one. An injection that lands after covering is turned off again
 * finds it off and stays idle. Not after a Chromium update from
 * `LAST_LEGACY_VERSION` or before: a new copy would run beside the old one.
 */
async function setRegistered(on: boolean, updatedFrom: string | undefined): Promise<void> {
  const registered = (await chrome.scripting.getRegisteredContentScripts({ids: [SCRIPT_ID]})).length > 0
  if (on) {
    await (registered ? chrome.scripting.updateContentScripts([SCRIPT]) : chrome.scripting.registerContentScripts([SCRIPT]))
    const legacy = updatedFrom !== undefined && isChromiumLike && compareVersions(updatedFrom, LAST_LEGACY_VERSION) <= 0
    if (!legacy && (updatedFrom !== undefined || !registered)) eachOpenTab(injectPageScript).catch(console.error)
  } else if (registered) {
    await chrome.scripting.unregisterContentScripts({ids: [SCRIPT_ID]})
  }
}

/**
 * The top frame of every open http(s) tab. A discarded tab is skipped: it
 * loads again when shown, under the registration.
 */
async function eachOpenTab(run: (tabId: number) => Promise<void>): Promise<void> {
  const tabs = await chrome.tabs.query({url: PAGE_ORIGINS, discarded: false})
  await Promise.all(tabs.map(({id}) => (id === undefined ? undefined : run(id))))
}

/**
 * Runs the page script in the tab's top frame, as the registration would
 * have done had it been there when the page loaded. The page decides for
 * itself, as on load; in one that already runs it, it does nothing. A tab
 * that refuses (an error page, the web store, a PDF) has nothing to cover.
 */
export async function injectPageScript(tabId: number): Promise<void> {
  await chrome.scripting
    .executeScript({target: {tabId}, files: [SCRIPT_FILE], injectImmediately: true})
    .catch(() => undefined)
}

/**
 * Brings the registration in line with the setting and the permission as
 * they are now (read inside the queue): on install, update and startup, and
 * when the setting changes. Covering on without the permission is turned off.
 * The permission itself is never given back here: once granted it is kept
 * while covering is off, so turning it back on doesn't ask again.
 * `updatedFrom`: the version the extension was just updated from (see `setRegistered`).
 */
export function reconcilePageScript({updatedFrom}: {updatedFrom?: string} = {}): Promise<void> {
  return serial(async () => {
    const [prefs, access] = await Promise.all([loadPrefs(), hasPageAccess()])
    if (prefs.cover && !access) {
      // The change to `prefs` reconciles again; nothing is registered meanwhile.
      await updatePrefs({cover: false})
      await setRegistered(false, updatedFrom)
      return
    }
    await setRegistered(prefs.cover && access, updatedFrom)
  })
}

/** Turns covering on or off to follow the permission. */
function follow(cover: boolean): Promise<void> {
  return serial(async () => {
    if ((await loadPrefs()).cover !== cover) await updatePrefs({cover})
  })
}

// Whether the whole block is held is checked rather than the event's
// origins: granting other hosts doesn't give the whole block, and taking
// some away may break it. A grant turns covering on only in answer to the
// popup's request: the block stays held while covering is off, and a grant
// made elsewhere (the extension menu's site access, the details page) must
// not turn it back on.
chrome.permissions.onAdded.addListener(({origins}) => {
  if (!origins?.length) return
  hasPageAccess()
    .then(async (access) => {
      if (access && (await takePageAccessRequest())) await follow(true)
    })
    .catch(console.error)
})

chrome.permissions.onRemoved.addListener(() => {
  hasPageAccess()
    .then((access) => (access ? undefined : follow(false)))
    .catch(console.error)
})

chrome.storage.onChanged.addListener((changes, area) => {
  const prefs = changes[STORAGE_KEYS.prefs]
  if (area !== 'local' || !prefs) return
  if (parsePrefs(prefs.oldValue).cover !== parsePrefs(prefs.newValue).cover) reconcilePageScript().catch(console.error)
})
