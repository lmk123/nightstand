import {parsePrefs} from '@nightstand/core'
import {serialQueue} from '@/lib/concurrency'
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
 * - withdrawn (by the user on the details page): covering turns off, which
 *   also unmutes and forgets tabs (background/cover.ts).
 * - covering turned off (the popup's switch): the permission is given back
 *   here, not in the popup, so that it is decided on the setting as it is
 *   when it runs: turned off and straight back on (still granted, so the
 *   popup saves "on" without a prompt) keeps it.
 * - on install, update and startup the two are reconciled the same way:
 *   covering on with no permission (refused, or not kept by an update) turns
 *   off; covering off with the permission (an update from a build that
 *   declared the script and covered by default) gives the permission back.
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
 * is now (read inside the queue, not taken from the change that started it).
 * Runs on install / startup and when the setting changes, never right after
 * a grant: the setting may not say "on" yet then (see `follow`), and giving
 * the permission back would undo the grant.
 */
function sync(): Promise<void> {
  return serial(async () => {
    const [prefs, access] = await Promise.all([loadPrefs(), hasPageAccess()])
    if (prefs.cover && !access) {
      // The change to `prefs` syncs again; nothing is registered meanwhile.
      await savePrefs({...prefs, cover: false})
      await setRegistered(false)
      return
    }
    if (!prefs.cover && access) {
      // Fails only where the permission is a required one (the e2e build).
      await removePageAccess().catch(() => undefined)
    }
    await setRegistered(prefs.cover && access)
  })
}

/** Install, update or startup. */
export function reconcilePageScript(): Promise<void> {
  return sync()
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
  if (parsePrefs(prefs.oldValue).cover !== parsePrefs(prefs.newValue).cover) sync().catch(console.error)
})
