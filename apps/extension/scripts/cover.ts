// Entry for the page script (background/page-script.ts registers this file).
// Not listed in the manifest's `content_scripts`: the registration's matches
// are optional host permissions, asked for when the user turns covering on.
//
// Not a default-exported function: Extension.js would load that one
// asynchronously (its wrapper for HMR, which it adds only in development and
// for scripts the manifest declares), too late to hide the page before it
// paints. A plain call runs as soon as the browser injects the script, at the
// `document_start` it is registered with.
import main from '@/content/cover'

/**
 * Set once a copy runs in this page. The background also injects the script
 * into open tabs (covering turned on, an update, a page back from the
 * back/forward cache), some of which already run it: that copy decides again
 * on its own when covering turns on, so no second one starts. A copy from
 * before an extension update runs on another global and doesn't count.
 */
const RUNNING = 'nightstandRunning'

const slot = globalThis as typeof globalThis & {[RUNNING]?: true}
if (!slot[RUNNING] && main()) slot[RUNNING] = true
