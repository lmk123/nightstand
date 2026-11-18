import {parsePrefs} from '@nightstand/core'
import {serialQueue} from '@/lib/concurrency'
import {hasPageAccess, PAGE_ORIGINS, removePageAccess} from '@/platform/page-access'
import {loadPrefs, savePrefs, STORAGE_KEYS} from '@/platform/storage'

/**
 * Registers the page script (`scripts/cover.ts`) only while covering is on
 * and its optional all-sites permission is granted; not declared in the
 * manifest, which would make that permission a required one. The permission
 * and `prefs.cover` are kept in step here: a grant turns covering on (Chrome
 * closes the popup when its prompt opens), a withdrawal turns it off, and
 * install / update / startup reconcile the two. Why each way round: read
 * `apps/extension/.context/cover/cover-behavior.md` before changing it.
 */
const SCRIPT_ID = 'cover'

const SCRIPT: chrome.scripting.RegisteredContentScript = {
  id: SCRIPT_ID,
  js: ['scripts/cover.js'],
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
 * whose script or options differ.
 */
async function setRegistered(on: boolean): Promise<void> {
  const registered = (await chrome.scripting.getRegisteredContentScripts({ids: [SCRIPT_ID]})).length > 0
  if (on) await (registered ? chrome.scripting.updateContentScripts([SCRIPT]) : chrome.scripting.registerContentScripts([SCRIPT]))
  else if (registered) await chrome.scripting.unregisterContentScripts({ids: [SCRIPT_ID]})
}

/**
 * Brings the registration and the permission in line with the setting as it
 * is now (read inside the queue): on install, update and startup, and when
 * the setting changes. Never right after a grant, when the setting may not
 * say "on" yet (see `follow`): giving the permission back would undo it.
 */
export function reconcilePageScript(): Promise<void> {
  return serial(async () => {
    const [prefs, access] = await Promise.all([loadPrefs(), hasPageAccess()])
    if (prefs.cover && !access) {
      // The change to `prefs` reconciles again; nothing is registered meanwhile.
      await savePrefs({...prefs, cover: false})
      await setRegistered(false)
      return
    }
    if (!prefs.cover && access) {
      // The popup gives it back when covering is turned off; this is for an
      // update from a build that required it, and fails only where it still
      // is required (the e2e build).
      await removePageAccess().catch(() => undefined)
    }
    await setRegistered(prefs.cover && access)
  })
}

/** Turns covering on or off to follow the permission. */
function follow(cover: boolean): Promise<void> {
  return serial(async () => {
    const prefs = await loadPrefs()
    if (prefs.cover !== cover) await savePrefs({...prefs, cover})
  })
}

// Whether the whole block is held is checked rather than the event's
// origins: granting other hosts doesn't give the whole block, and taking
// some away may break it. A grant without hosts is ignored: with the block
// already held (say it couldn't be given back), it must not turn covering on.
chrome.permissions.onAdded.addListener(({origins}) => {
  if (!origins?.length) return
  hasPageAccess()
    .then((access) => (access ? follow(true) : undefined))
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
