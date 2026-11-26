// Build entry for the page script, which lives in src/content/cover.ts. It is
// registered at run time (src/background/page-script.ts) instead of declared
// in the manifest, so that its all-sites host permission can be optional.
//
// No default export on purpose: Extension.js would wrap a default-exported
// entry in `scripts/` to start at `document_idle` (it only knows a run time
// for scripts the manifest declares), too late to hide the page before it
// paints. A plain call runs as soon as the browser injects the script, at the
// `document_start` it is registered with.
import main from '@/content/cover'

/**
 * The running copy's stop, on the content scripts' own global (pages can't
 * see it). Turning covering on injects the script into open tabs, some of
 * which already run it (loaded before covering was last turned off): the new
 * copy replaces that one instead of running beside it.
 *
 * Where the old copy kept the page out of sight, the new one holds it
 * invisible until it has decided; both happen in this one task, so nothing
 * paints in between. An old copy that fails to stop (its extension context
 * gone) must not keep the new one from starting: it is taken as having kept
 * the page out of sight.
 */
const STOP_KEY = 'nightstandStop'
const slot = globalThis as typeof globalThis & {[STOP_KEY]?: () => unknown}

function stopRunning(): boolean {
  try {
    return slot[STOP_KEY]?.() === true
  } catch (error) {
    console.error(error)
    return true
  }
}

slot[STOP_KEY] = main({hold: stopRunning()})
