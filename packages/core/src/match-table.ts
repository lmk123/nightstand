/**
 * The plaintext match table the background uses to clean history while the
 * vault is locked.
 *
 * It stores SHA-256(salt ‖ kind ‖ value) for every protected host (`site`:
 * the host of each `site` entry and every entry's extra hosts)
 * and every protected exact URL (`exact`), with a random per-device salt.
 *
 * Honest limits: this only keeps the list from being readable at a glance by
 * someone browsing extension storage. Anyone who can read the table and the
 * salt can hash a list of candidate domains and compare, so it does not
 * protect against a determined attacker with access to the machine.
 */
import {CoreError} from './errors.ts'
import {isRecord, isString, isStringArray} from './guards.ts'
import {entrySiteHosts, type EntryScope} from './model.ts'
import {base64ToBytes, bytesToBase64, bytesToHex, concatBytes, randomBytes, utf8Encode, type Bytes} from './crypto/encoding.ts'
import {exactCandidates, hostCandidates, normalizeExactUrl, parseHttpUrl, normalizeHost} from './url.ts'

export interface MatchTable {
  version: 1
  /** Base64, 16 random bytes, generated once per device. */
  salt: string
  /** Sorted hex hashes; sorting hides insertion order. */
  site: string[]
  exact: string[]
}

export type MatchKind = 'site' | 'exact'

export function newMatchSalt(): string {
  return bytesToBase64(randomBytes(16))
}

async function hashWith(salt: Bytes, kind: MatchKind, value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', concatBytes(salt, utf8Encode(`${kind}\u0000${value}`)))
  return bytesToHex(new Uint8Array(digest))
}

export async function hashMatchValue(salt: string, kind: MatchKind, value: string): Promise<string> {
  return hashWith(base64ToBytes(salt), kind, value)
}

/** Builds the table from vault entries. Pass the existing salt to keep it stable across rebuilds. */
export async function buildMatchTable(
  entries: readonly EntryScope[],
  salt: string = newMatchSalt()
): Promise<MatchTable> {
  const saltBytes = base64ToBytes(salt)
  const site = new Set<string>()
  const exact = new Set<string>()
  for (const entry of entries) {
    for (const host of entrySiteHosts(entry)) site.add(await hashWith(saltBytes, 'site', host))
    if (entry.matchMode === 'exact') {
      const url = normalizeExactUrl(entry.url)
      if (url) exact.add(await hashWith(saltBytes, 'exact', url))
    }
  }
  return {version: 1, salt, site: [...site].sort(), exact: [...exact].sort()}
}

export interface UrlMatcher {
  /** True when the URL is protected by a `site` or `exact` entry. */
  matches(url: string): Promise<boolean>
  /** True when the host (or a parent domain) is protected by a `site` entry. */
  matchesHost(host: string): Promise<boolean>
  readonly isEmpty: boolean
}

/**
 * Most host candidates whose answer a matcher remembers. A full history scan
 * sees the same few thousand hosts (and far fewer parent domains) over and
 * over; the bound only keeps a long-lived matcher from growing without limit.
 */
const MAX_REMEMBERED_HOSTS = 10_000

/** Precomputes lookup sets for repeated matching (background listeners). */
export function createMatcher(table: MatchTable): UrlMatcher {
  const salt = base64ToBytes(table.salt)
  const site = new Set(table.site)
  const exact = new Set(table.exact)
  // The table never changes for this matcher, so each candidate's answer
  // can be kept instead of hashing it again for every history item.
  const siteAnswers = new Map<string, boolean>()

  async function isProtectedSite(candidate: string): Promise<boolean> {
    let answer = siteAnswers.get(candidate)
    if (answer === undefined) {
      answer = site.has(await hashWith(salt, 'site', candidate))
      if (siteAnswers.size >= MAX_REMEMBERED_HOSTS) siteAnswers.clear()
      siteAnswers.set(candidate, answer)
    }
    return answer
  }

  async function matchesHost(rawHost: string): Promise<boolean> {
    if (site.size === 0) return false
    const host = normalizeHost(rawHost)
    if (!host) return false
    for (const candidate of hostCandidates(host)) {
      if (await isProtectedSite(candidate)) return true
    }
    return false
  }

  return {
    isEmpty: site.size === 0 && exact.size === 0,
    matchesHost,
    async matches(url: string): Promise<boolean> {
      const parsed = parseHttpUrl(url)
      if (!parsed) return false
      if (await matchesHost(parsed.hostname)) return true
      if (exact.size === 0) return false
      for (const candidate of exactCandidates(url)) {
        if (exact.has(await hashWith(salt, 'exact', candidate))) return true
      }
      return false
    }
  }
}

/** Same salt and same hashes: writing `b` over `a` would change nothing. */
export function sameMatchTable(a: MatchTable, b: MatchTable): boolean {
  const same = (x: readonly string[], y: readonly string[]) => x.length === y.length && x.every((v, i) => v === y[i])
  return a.version === b.version && a.salt === b.salt && same(a.site, b.site) && same(a.exact, b.exact)
}

export function emptyMatchTable(salt: string = newMatchSalt()): MatchTable {
  return {version: 1, salt, site: [], exact: []}
}

/** A base64 salt `hashWith` can decode (anything else would make every lookup throw). */
function isSalt(value: unknown): value is string {
  if (!isString(value)) return false
  try {
    return base64ToBytes(value).length > 0
  } catch {
    return false
  }
}

export function parseMatchTable(raw: unknown): MatchTable {
  if (
    isRecord(raw) &&
    raw.version === 1 &&
    isSalt(raw.salt) &&
    isStringArray(raw.site) &&
    isStringArray(raw.exact)
  ) {
    return {version: 1, salt: raw.salt, site: [...raw.site], exact: [...raw.exact]}
  }
  throw new CoreError('invalid-data', 'malformed match table')
}
