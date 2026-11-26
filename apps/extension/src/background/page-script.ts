import {parsePrefs} from '@nightstand/core'
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
 * whose script or options differ. Registering it anew injects it into the
 * open tabs as well.
 */
async function setRegistered(on: boolean): Promise<void> {
  const registered = (await chrome.scripting.getRegisteredContentScripts({ids: [SCRIPT_ID]})).length > 0
  if (on && registered) {
    await chrome.scripting.updateContentScripts([SCRIPT])
  } else if (on) {
    await chrome.scripting.registerContentScripts([SCRIPT])
    await injectOpenTabs()
  } else if (registered) {
    await chrome.scripting.unregisterContentScripts({ids: [SCRIPT_ID]})
  }
}

/**
 * The top frame of every open http(s) tab, as the registration would have
 * done had it been there when they loaded. Each page decides for itself, as
 * on load; a page that already runs the script (loaded before covering was
 * last turned off) replaces it. A discarded tab is skipped: it loads again
 * when shown, under the registration. A tab that refuses (an error page,
 * the web store) has nothing to cover.
 */
async function injectOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({url: PAGE_ORIGINS, discarded: false})
  await Promise.all(
    tabs.map(({id}) =>
      id === undefined
        ? undefined
        : chrome.scripting
            .executeScript({target: {tabId: id}, files: [SCRIPT_FILE], injectImmediately: true})
            .catch(() => undefined)
    )
  )
}

/**
 * Brings the registration in line with the setting and the permission as
 * they are now (read inside the queue): on install, update and startup, and
 * when the setting changes. Covering on without the permission is turned off.
 * The permission itself is never given back here: once granted it is kept
 * while covering is off, so turning it back on doesn't ask again.
 */
export function reconcilePageScript(): Promise<void> {
  return serial(async () => {
    const [prefs, access] = await Promise.all([loadPrefs(), hasPageAccess()])
    if (prefs.cover && !access) {
      // The change to `prefs` reconciles again; nothing is registered meanwhile.
      await updatePrefs({cover: false})
      await setRegistered(false)
      return
    }
    await setRegistered(prefs.cover && access)
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
