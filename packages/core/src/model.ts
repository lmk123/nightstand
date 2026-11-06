import {CoreError} from './errors.ts'
import {isFiniteNumber, isRecord, isString, isStringArray} from './guards.ts'
import {hostCandidates, hostOf, normalizeExactUrl, normalizeHost, parseUserUrl} from './url.ts'

/** `site`: the whole site including every subdomain (default). `exact`: this one address only. */
export type MatchMode = 'site' | 'exact'

/** Where an entry opens: the current tab, a new tab, or an incognito / private window. */
export type OpenMode = 'current' | 'newTab' | 'incognito'

export interface VaultEntry {
  id: string
  url: string
  title: string
  matchMode: MatchMode
  /**
   * More hosts this entry protects besides its own URL, each with every
   * subdomain (like a `site` entry), whatever `matchMode` is: the video CDN a
   * site plays from, the payment page it hands off to. Normalized hosts.
   */
  extraHosts: string[]
  createdAt: number
  lastOpenedAt?: number
  openCount: number
}

export interface VaultSettings {
  openMode: OpenMode
  /**
   * The user ticked "don't show again" on the notice shown before saving an
   * entry (saving wipes that site's / URL's existing history). Absent means
   * the notice is shown. Added without a payload version bump: it is optional,
   * and builds that don't know it simply drop it (the notice comes back).
   */
  skipSaveNotice?: boolean
}

/**
 * Decrypted vault payload. `version` is the payload schema version:
 * 1 — initial; 2 — entries gain `extraHosts`; 3 — entries lose `note` and `tags`.
 */
export interface VaultData {
  version: 3
  entries: VaultEntry[]
  settings: VaultSettings
}

export const VAULT_DATA_VERSION = 3

export const DEFAULT_SETTINGS: VaultSettings = {openMode: 'newTab'}

export function emptyVaultData(): VaultData {
  return {version: VAULT_DATA_VERSION, entries: [], settings: {...DEFAULT_SETTINGS}}
}

export interface EntryInput {
  url: string
  title?: string
  matchMode?: MatchMode
  /** Hosts or URLs as typed; see `parseExtraHosts`. */
  extraHosts?: readonly string[]
}

export interface ParsedExtraHosts {
  /** Normalized, de-duplicated, in input order. */
  hosts: string[]
  /** Pieces that are not a host or http(s) URL, as typed. */
  invalid: string[]
}

/**
 * Splits user input (one host per line; spaces and commas also separate)
 * into normalized hosts. A full URL contributes its host, and a leading
 * `*.` is dropped since subdomains are always covered.
 */
export function parseExtraHosts(input: string | readonly string[]): ParsedExtraHosts {
  const pieces = (typeof input === 'string' ? [input] : input).flatMap((s) => s.split(/[\s,，、]+/))
  const hosts = new Set<string>()
  const invalid: string[] = []
  for (const piece of pieces) {
    if (!piece) continue
    const parsed = parseUserUrl(piece.replace(/^\*\./, ''))
    const host = parsed ? normalizeHost(parsed.hostname) : null
    if (host) hosts.add(host)
    else invalid.push(piece)
  }
  return {hosts: [...hosts], invalid}
}

/**
 * Validates and normalizes user input into a new entry. Throws `invalid-url`,
 * or `invalid-host` when an extra host doesn't parse (check with
 * `parseExtraHosts` first to show which).
 */
export function createEntry(
  input: EntryInput,
  now: number,
  id: string = crypto.randomUUID()
): VaultEntry {
  const parsed = parseUserUrl(input.url)
  if (!parsed) throw new CoreError('invalid-url')
  const url = parsed.href
  const title = input.title?.trim() || hostOf(url) || url
  const matchMode = input.matchMode ?? 'site'
  const extra = parseExtraHosts(input.extraHosts ?? [])
  if (extra.invalid.length > 0) throw new CoreError('invalid-host', extra.invalid.join(' '))
  // The entry's own host is already covered in `site` mode.
  const ownHost = matchMode === 'site' ? hostOf(url) : null
  return {
    id,
    url,
    title,
    matchMode,
    extraHosts: extra.hosts.filter((h) => h !== ownHost),
    createdAt: now,
    openCount: 0
  }
}

/** Applies an edit; the URL is re-validated. Throws `invalid-url`. */
export function editEntry(entry: VaultEntry, patch: EntryInput): VaultEntry {
  const updated = createEntry(
    {
      url: patch.url,
      title: patch.title,
      matchMode: patch.matchMode ?? entry.matchMode,
      extraHosts: patch.extraHosts ?? entry.extraHosts
    },
    entry.createdAt,
    entry.id
  )
  updated.openCount = entry.openCount
  if (entry.lastOpenedAt !== undefined) updated.lastOpenedAt = entry.lastOpenedAt
  return updated
}

/**
 * Identity used to detect duplicates: `site:<host>` or `exact:<normalized url>`.
 * Null for an entry whose URL is not http(s).
 */
export function entryKey(entry: Pick<VaultEntry, 'url' | 'matchMode'>): string | null {
  const value = entry.matchMode === 'site' ? hostOf(entry.url) : normalizeExactUrl(entry.url)
  return value ? `${entry.matchMode}:${value}` : null
}

/** What decides which URLs an entry covers. */
export type EntryScope = Pick<VaultEntry, 'url' | 'matchMode'> & {extraHosts?: readonly string[]}

/**
 * Does saving `after` (over `before`, or as a new entry when `before` is
 * undefined) protect anything that wasn't protected yet: a new site / URL or
 * a new extra host? Only the title changing (or hosts dropped) is not.
 */
export function widensScope(before: EntryScope | undefined, after: EntryScope): boolean {
  if (!before) return true
  if (entryKey(before) !== entryKey(after)) return true
  const old = before.extraHosts ?? []
  return (after.extraHosts ?? []).some((h) => !old.includes(h))
}

/** Every host an entry protects with all its subdomains: its own (in `site` mode) and its extra hosts. */
export function entrySiteHosts(entry: EntryScope): string[] {
  const own = entry.matchMode === 'site' ? hostOf(entry.url) : null
  const extra = entry.extraHosts ?? []
  return own ? [own, ...extra.filter((h) => h !== own)] : [...extra]
}

/**
 * Plaintext check (popup only, where the vault is unlocked): is `url` covered
 * by this entry? Same rules as the hashed match table.
 */
export function entryCoversUrl(entry: EntryScope, url: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  if (entry.matchMode === 'exact') {
    const target = normalizeExactUrl(entry.url)
    if (target !== null && normalizeExactUrl(url) === target) return true
  }
  const candidates = hostCandidates(host)
  return entrySiteHosts(entry).some((h) => candidates.includes(h))
}

export function findDuplicate(
  entries: readonly VaultEntry[],
  candidate: Pick<VaultEntry, 'url' | 'matchMode'>,
  ignoreId?: string
): VaultEntry | undefined {
  const key = entryKey(candidate)
  if (!key) return undefined
  return entries.find((e) => e.id !== ignoreId && entryKey(e) === key)
}

export function addEntry(data: VaultData, entry: VaultEntry): VaultData {
  return {...data, entries: [entry, ...data.entries]}
}

export function replaceEntry(data: VaultData, entry: VaultEntry): VaultData {
  return {...data, entries: data.entries.map((e) => (e.id === entry.id ? entry : e))}
}

export function removeEntry(data: VaultData, id: string): VaultData {
  return {...data, entries: data.entries.filter((e) => e.id !== id)}
}

export function recordOpen(data: VaultData, id: string, now: number): VaultData {
  return {
    ...data,
    entries: data.entries.map((e) =>
      e.id === id ? {...e, lastOpenedAt: now, openCount: e.openCount + 1} : e
    )
  }
}

export function updateSettings(data: VaultData, patch: Partial<VaultSettings>): VaultData {
  return {...data, settings: {...data.settings, ...patch}}
}

/** Case-insensitive search over title, URL and extra hosts; every whitespace-separated term must match. */
export function searchEntries(entries: readonly VaultEntry[], query: string): VaultEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...entries]
  return entries.filter((e) => {
    const haystack = [e.title, e.url, ...e.extraHosts].join('\n').toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

const MATCH_MODES: readonly string[] = ['site', 'exact']
const OPEN_MODES: readonly string[] = ['current', 'newTab', 'incognito']

/** Fields every payload version's entries have, checked without `note` / `tags` / `extraHosts`. */
function hasCommonEntryFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.id) &&
    isString(value.url) &&
    isString(value.title) &&
    isString(value.matchMode) &&
    MATCH_MODES.includes(value.matchMode) &&
    isFiniteNumber(value.createdAt) &&
    (value.lastOpenedAt === undefined || isFiniteNumber(value.lastOpenedAt)) &&
    isFiniteNumber(value.openCount)
  )
}

/** A v1 entry: v3 fields minus `extraHosts`, plus an optional `note` and `tags`. */
type EntryV1 = Omit<VaultEntry, 'extraHosts'> & {note?: string; tags: string[]}

function isVaultEntryV1(value: unknown): value is EntryV1 {
  return (
    isRecord(value) &&
    hasCommonEntryFields(value) &&
    (value.note === undefined || isString(value.note)) &&
    isStringArray(value.tags)
  )
}

/** A v2 entry: a v1 entry with `extraHosts`. */
function isVaultEntryV2(value: unknown): value is EntryV1 & {extraHosts: string[]} {
  return isVaultEntryV1(value) && isStringArray((value as Record<string, unknown>).extraHosts)
}

export function isVaultEntry(value: unknown): value is VaultEntry {
  return isRecord(value) && hasCommonEntryFields(value) && isStringArray(value.extraHosts)
}

/** Copies only the current entry fields, so removed ones (`note`, `tags`) don't linger. */
function pickEntry(e: Omit<VaultEntry, 'extraHosts'>, extraHosts: string[]): VaultEntry {
  const entry: VaultEntry = {
    id: e.id,
    url: e.url,
    title: e.title,
    matchMode: e.matchMode,
    extraHosts,
    createdAt: e.createdAt,
    openCount: e.openCount
  }
  if (e.lastOpenedAt !== undefined) entry.lastOpenedAt = e.lastOpenedAt
  return entry
}

/**
 * Validates a decrypted payload and upgrades older payload versions.
 * Unknown settings fall back to defaults instead of failing, so a payload
 * written by a newer build with extra settings still opens.
 */
export function migrateVaultData(raw: unknown): VaultData {
  if (!isRecord(raw)) throw new CoreError('invalid-data', 'payload is not an object')
  let entries: VaultEntry[]
  switch (raw.version) {
    case 1:
      // v1 → v2: entries gain `extraHosts`; v2 → v3: `note` and `tags` are dropped.
      if (!Array.isArray(raw.entries) || !raw.entries.every(isVaultEntryV1)) {
        throw new CoreError('invalid-data', 'bad entries')
      }
      entries = raw.entries.map((e) => pickEntry(e, []))
      break
    case 2:
      // v2 → v3: `note` and `tags` are dropped.
      if (!Array.isArray(raw.entries) || !raw.entries.every(isVaultEntryV2)) {
        throw new CoreError('invalid-data', 'bad entries')
      }
      entries = raw.entries.map((e) => pickEntry(e, [...e.extraHosts]))
      break
    case 3:
      if (!Array.isArray(raw.entries) || !raw.entries.every(isVaultEntry)) {
        throw new CoreError('invalid-data', 'bad entries')
      }
      entries = raw.entries.map((e) => pickEntry(e, [...e.extraHosts]))
      break
    default:
      throw new CoreError('unsupported-version', `payload version ${String(raw.version)}`)
  }
  const settings = isRecord(raw.settings) ? raw.settings : {}
  const openMode =
    isString(settings.openMode) && OPEN_MODES.includes(settings.openMode)
      ? (settings.openMode as OpenMode)
      : DEFAULT_SETTINGS.openMode
  const out: VaultSettings = {openMode}
  if (typeof settings.skipSaveNotice === 'boolean') out.skipSaveNotice = settings.skipSaveNotice
  return {version: VAULT_DATA_VERSION, entries, settings: out}
}
