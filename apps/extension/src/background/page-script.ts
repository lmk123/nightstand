import {parsePrefs} from '@nightstand/core'
import {hasPageAccess, PAGE_ORIGINS, removePageAccess} from '@/platform/page-access'
import {loadPrefs, savePrefs, STORAGE_KEYS} from '@/platform/storage'

/**
 * Registers the page script (`scripts/cover.ts`) only while covering is on
 * and its all-sites host permission is granted. It is not declared in the
 * manifest: Chrome would make a declared script's hosts a required
 * permission, shown when installing ("read and change all your data on all
 * websites") and on the details page even with covering off.
 *
 * `prefs.cover` is the setting; the permission follows it:
 * - granted (from the popup's switch, or by the user on the details page):
 *   covering turns on. The popup can't do it itself: Chrome closes it when
 *   the permission prompt opens.
 * - withdrawn (the popup's switch removes it, or the user on the details
 *   page): covering turns off, which also unmutes and forgets tabs
 *   (background/cover.ts).
 * - on install, update and startup the two are reconciled: covering on with
 *   no permission (refused, or not kept by an update) turns off; covering
 *   off with the permission (an update from a build that declared the script
 *   and covered by default) gives the permission back.
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

let queue: Promise<unknown> = Promise.resolve()

/** One change at a time: a permission event and a preferences change can arrive together. */
function serial(task: () => Promise<void>): Promise<void> {
  const run = queue.then(task)
  queue = run.catch(() => undefined)
  return run
}

async function setRegistered(on: boolean): Promise<void> {
  const registered = (await chrome.scripting.getRegisteredContentScripts({ids: [SCRIPT_ID]})).length > 0
  if (on && !registered) await chrome.scripting.registerContentScripts([SCRIPT])
  else if (!on && registered) await chrome.scripting.unregisterContentScripts({ids: [SCRIPT_ID]})
}

/**
 * Brings the registration (and, with `reconcile`, the permission) in line
 * with the setting. Only install / startup give the permission back: right
 * after a grant, the setting may not say "on" yet (see `onGranted`).
 */
function sync(reconcile = false): Promise<void> {
  return serial(async () => {
    const [prefs, access] = await Promise.all([loadPrefs(), hasPageAccess()])
    if (prefs.cover && !access) {
      // The change to `prefs` syncs again; nothing is registered meanwhile.
      await savePrefs({...prefs, cover: false})
      await setRegistered(false)
      return
    }
    if (reconcile && !prefs.cover && access) {
      await removePageAccess().catch(() => undefined)
    }
    await setRegistered(prefs.cover && access)
  })
}

/** Install, update or startup. */
export function reconcilePageScript(): Promise<void> {
  return sync(true)
}

/** Turns covering on or off to follow the permission. */
function follow(cover: boolean): Promise<void> {
  return serial(async () => {
    const prefs = await loadPrefs()
    if (prefs.cover !== cover) await savePrefs({...prefs, cover})
  })
}

// The event's origins aren't checked: granting other hosts doesn't give the
// whole block, and taking some away may break it.
chrome.permissions.onAdded.addListener(() => {
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
  if (parsePrefs(prefs.oldValue).cover !== parsePrefs(prefs.newValue).cover) sync().catch(console.error)
})
