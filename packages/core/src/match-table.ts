/**
 * The plaintext match table the background uses to clean history while the
 * vault is locked.
 *
 * It stores SHA-256(salt ‖ kind ‖ value) for every protected host (`site`)
 * and every protected exact URL (`exact`), with a random per-device salt.
 *
 * Honest limits: this only keeps the list from being readable at a glance by
 * someone browsing extension storage. Anyone who can read the table and the
 * salt can hash a list of candidate domains and compare, so it does not
 * protect against a determined attacker with access to the machine.
 */
import {CoreError} from './errors.ts'
import {isRecord, isString, isStringArray} from './guards.ts'
import type {VaultEntry} from './model.ts'
import {base64ToBytes, bytesToBase64, bytesToHex, concatBytes, randomBytes, utf8Encode, type Bytes} from './crypto/encoding.ts'
import {hostCandidates, hostOf, normalizeExactUrl, parseHttpUrl, normalizeHost} from './url.ts'

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
  entries: readonly Pick<VaultEntry, 'url' | 'matchMode'>[],
  salt: string = newMatchSalt()
): Promise<MatchTable> {
  const saltBytes = base64ToBytes(salt)
  const site = new Set<string>()
  const exact = new Set<string>()
  for (const entry of entries) {
    if (entry.matchMode === 'site') {
      const host = hostOf(entry.url)
      if (host) site.add(await hashWith(saltBytes, 'site', host))
    } else {
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

/** Precomputes lookup sets for repeated matching (background listeners). */
export function createMatcher(table: MatchTable): UrlMatcher {
  const salt = base64ToBytes(table.salt)
  const site = new Set(table.site)
  const exact = new Set(table.exact)

  async function matchesHost(rawHost: string): Promise<boolean> {
    if (site.size === 0) return false
    const host = normalizeHost(rawHost)
    if (!host) return false
    for (const candidate of hostCandidates(host)) {
      if (site.has(await hashWith(salt, 'site', candidate))) return true
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
      const normalized = normalizeExactUrl(url)
      return normalized !== null && exact.has(await hashWith(salt, 'exact', normalized))
    }
  }
}

export function emptyMatchTable(salt: string = newMatchSalt()): MatchTable {
  return {version: 1, salt, site: [], exact: []}
}

export function parseMatchTable(raw: unknown): MatchTable {
  if (
    isRecord(raw) &&
    raw.version === 1 &&
    isString(raw.salt) &&
    isStringArray(raw.site) &&
    isStringArray(raw.exact)
  ) {
    return {version: 1, salt: raw.salt, site: [...raw.site], exact: [...raw.exact]}
  }
  throw new CoreError('invalid-data', 'malformed match table')
}
