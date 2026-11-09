import {isRecord} from './guards.ts'

/** How long a shown page may go without input before it is covered again. */
export const IDLE_MINUTES = [1, 2, 5] as const

export type IdleMinutes = (typeof IDLE_MINUTES)[number]

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
 * - `idleMinutes`: a shown page is covered again after this many minutes
 *   without input on it (while its tab plays sound, the wait doesn't end).
 *
 * `cover` and `mute` default to on, `idleMinutes` to 1; an absent key
 * (fresh install, older build) means the default.
 */
export interface Prefs {
  cover: boolean
  mute: boolean
  idleMinutes: IdleMinutes
}

export function defaultPrefs(): Prefs {
  return {cover: true, mute: true, idleMinutes: 1}
}

export function isIdleMinutes(value: unknown): value is IdleMinutes {
  return (IDLE_MINUTES as readonly unknown[]).includes(value)
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
  if (isIdleMinutes(raw.idleMinutes)) prefs.idleMinutes = raw.idleMinutes
  return prefs
}
