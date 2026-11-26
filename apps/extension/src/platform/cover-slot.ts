/**
 * Where the page script keeps its stop: a property on the content scripts'
 * own global (pages can't see it), shared by every copy injected into the
 * page since it loaded. On Chromium that global outlives an extension update
 * (the old copy keeps running, cut off from the extension); on Firefox an
 * update destroys the old copy and starts the new ones on a fresh global.
 */
export const STOP_KEY = 'nightstandStop'

/**
 * Put there by the background instead of a stop, in pages open when Chromium
 * updated the extension from a build whose page script keeps no stop (0.3.0
 * and before): that copy can't be stopped, so no new copy starts beside it.
 */
export const LEGACY_COPY = 'legacy'

/** The last version whose page script keeps no stop. */
export const LAST_LEGACY_VERSION = '0.3.0'
