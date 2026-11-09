import {isRecord} from './guards.ts'

/**
 * Device preferences the background and the page script need while the vault
 * is locked, so they are kept in plaintext (`prefs`) next to the vault rather
 * than inside it. Nothing here names a site.
 *
 * - `cover`: protected pages open behind an opaque cover until the user
 *   chooses to show them.
 * - `mute`: tabs on protected pages are muted until shown. Only while
 *   `cover` is on: with no cover, a page is never shown and the mute would
 *   never end.
 *
 * Both default to on; an absent key (fresh install, older build) means on.
 */
export interface Prefs {
  cover: boolean
  mute: boolean
}

export function defaultPrefs(): Prefs {
  return {cover: true, mute: true}
}

/**
 * Lenient parse, field by field: a malformed value falls back to its default
 * instead of failing, since these are not secret and must never get in the
 * way of loading a page.
 */
export function parsePrefs(raw: unknown): Prefs {
  const prefs = defaultPrefs()
  if (!isRecord(raw)) return prefs
  if (typeof raw.cover === 'boolean') prefs.cover = raw.cover
  if (typeof raw.mute === 'boolean') prefs.mute = raw.mute
  return prefs
}
