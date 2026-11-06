import {isRecord, isString} from './guards.ts'
import {parseUserUrl} from './url.ts'

/**
 * The decoy "Quick Links" launcher shown while locked, plus the plaintext
 * preferences needed before unlocking (icon, whether the decoy is used).
 */

export interface DecoyLink {
  id: string
  title: string
  url: string
}

export const ICON_SETS = ['nightstand', 'book', 'star', 'grid'] as const
export type IconSet = (typeof ICON_SETS)[number]

export interface DecoyConfig {
  version: 1
  links: DecoyLink[]
  icon: IconSet
  /** True: show the decoy launcher while locked. False: a classic passphrase screen. */
  disguise: boolean
}

export const DEFAULT_DECOY_LINKS: readonly DecoyLink[] = [
  {id: 'github', title: 'GitHub', url: 'https://github.com/'},
  {id: 'mdn', title: 'MDN Web Docs', url: 'https://developer.mozilla.org/'},
  {id: 'docs', title: 'Google Docs', url: 'https://docs.google.com/'},
  {id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/'}
]

export function defaultDecoyConfig(): DecoyConfig {
  return {
    version: 1,
    links: DEFAULT_DECOY_LINKS.map((l) => ({...l})),
    icon: 'nightstand',
    disguise: true
  }
}

/** Case-insensitive filter on title and URL; every term must match. */
export function filterDecoyLinks(links: readonly DecoyLink[], query: string): DecoyLink[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...links]
  return links.filter((link) => {
    const haystack = `${link.title}\n${link.url}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

/** Normalizes a user-entered decoy link; null if the URL is not http(s). */
export function makeDecoyLink(
  title: string,
  url: string,
  id: string = crypto.randomUUID()
): DecoyLink | null {
  const parsed = parseUserUrl(url)
  if (!parsed) return null
  return {id, title: title.trim() || parsed.hostname, url: parsed.href}
}

function isDecoyLink(value: unknown): value is DecoyLink {
  return isRecord(value) && isString(value.id) && isString(value.title) && isString(value.url)
}

function isIconSet(value: unknown): value is IconSet {
  return isString(value) && (ICON_SETS as readonly string[]).includes(value)
}

/**
 * Lenient parse: these preferences are not secret and must never block the
 * popup from opening, so anything malformed falls back to defaults.
 */
export function parseDecoyConfig(raw: unknown): DecoyConfig {
  const fallback = defaultDecoyConfig()
  if (!isRecord(raw)) return fallback
  return {
    version: 1,
    links: Array.isArray(raw.links) ? raw.links.filter(isDecoyLink) : fallback.links,
    icon: isIconSet(raw.icon) ? raw.icon : fallback.icon,
    disguise: typeof raw.disguise === 'boolean' ? raw.disguise : fallback.disguise
  }
}
