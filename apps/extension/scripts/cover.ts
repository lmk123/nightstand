// Entry for the page script (background/page-script.ts registers this file).
// Not listed in the manifest's `content_scripts`: the registration's matches
// are optional host permissions, asked for when the user turns covering on.
//
// Not a default-exported function: Extension.js would load that one
// asynchronously (its wrapper for HMR, which it adds only in development and
// for scripts the manifest declares), too late to hide the page before it
// paints. A plain call runs as soon as the browser injects the script, at the
// `document_start` it is registered with.
import main, {type Handover} from '@/content/cover'
import {LEGACY_COPY, STOP_KEY} from '@/platform/cover-slot'

/**
 * Turning covering on (or updating the extension while it is on) injects the
 * script into open tabs, some of which already run it: the new copy replaces
 * that one instead of running beside it. `main` stops it only once it knows
 * it can take over (see `main`).
 */
const slot = globalThis as typeof globalThis & {[STOP_KEY]?: (() => Handover) | typeof LEGACY_COPY}

const running = slot[STOP_KEY]
if (running !== LEGACY_COPY) {
  const stop = main(typeof running === 'function' ? running : undefined)
  if (stop) slot[STOP_KEY] = stop
}
