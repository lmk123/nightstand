import {CoreError} from './errors.ts'
import {isFiniteNumber, isRecord, isString, isStringArray} from './guards.ts'
import {hostCandidates, hostOf, normalizeExactUrl, parseUserUrl} from './url.ts'

/** `site`: the whole site including every subdomain (default). `exact`: this one address only. */
export type MatchMode = 'site' | 'exact'

/** Where an entry opens: the current tab, a new tab, or an incognito / private window. */
export type OpenMode = 'current' | 'newTab' | 'incognito'

export interface VaultEntry {
  id: string
  url: string
  title: string
  note?: string
  tags: string[]
  matchMode: MatchMode
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

/** Decrypted vault payload. `version` is the payload schema version. */
export interface VaultData {
  version: 1
  entries: VaultEntry[]
  settings: VaultSettings
}

export const VAULT_DATA_VERSION = 1

export const DEFAULT_SETTINGS: VaultSettings = {openMode: 'newTab'}

export function emptyVaultData(): VaultData {
  return {version: VAULT_DATA_VERSION, entries: [], settings: {...DEFAULT_SETTINGS}}
}

export interface EntryInput {
  url: string
  title?: string
  note?: string
  tags?: string[]
  matchMode?: MatchMode
}

function cleanTags(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  for (const tag of tags ?? []) {
    const trimmed = tag.trim()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim()
  return trimmed ? trimmed : undefined
}

/** Validates and normalizes user input into a new entry. Throws `invalid-url`. */
export function createEntry(
  input: EntryInput,
  now: number,
  id: string = crypto.randomUUID()
): VaultEntry {
  const parsed = parseUserUrl(input.url)
  if (!parsed) throw new CoreError('invalid-url')
  const url = parsed.href
  const title = input.title?.trim() || hostOf(url) || url
  const entry: VaultEntry = {
    id,
    url,
    title,
    tags: cleanTags(input.tags),
    matchMode: input.matchMode ?? 'site',
    createdAt: now,
    openCount: 0
  }
  const note = cleanNote(input.note)
  if (note) entry.note = note
  return entry
}

/** Applies an edit; the URL is re-validated. Throws `invalid-url`. */
export function editEntry(entry: VaultEntry, patch: EntryInput): VaultEntry {
  const updated = createEntry(
    {
      url: patch.url,
      title: patch.title,
      note: patch.note,
      tags: patch.tags,
      matchMode: patch.matchMode ?? entry.matchMode
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

/**
 * Plaintext check (popup only, where the vault is unlocked): is `url` covered
 * by this entry? Same rules as the hashed match table.
 */
export function entryCoversUrl(entry: Pick<VaultEntry, 'url' | 'matchMode'>, url: string): boolean {
  if (entry.matchMode === 'exact') {
    const target = normalizeExactUrl(entry.url)
    return target !== null && normalizeExactUrl(url) === target
  }
  const protectedHost = hostOf(entry.url)
  const host = hostOf(url)
  return protectedHost !== null && host !== null && hostCandidates(host).includes(protectedHost)
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

/** Case-insensitive search over title, URL, note and tags; every whitespace-separated term must match. */
export function searchEntries(entries: readonly VaultEntry[], query: string): VaultEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...entries]
  return entries.filter((e) => {
    const haystack = [e.title, e.url, e.note ?? '', ...e.tags].join('\n').toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

const MATCH_MODES: readonly string[] = ['site', 'exact']
const OPEN_MODES: readonly string[] = ['current', 'newTab', 'incognito']

export function isVaultEntry(value: unknown): value is VaultEntry {
  if (!isRecord(value)) return false
  return (
    isString(value.id) &&
    isString(value.url) &&
    isString(value.title) &&
    (value.note === undefined || isString(value.note)) &&
    isStringArray(value.tags) &&
    isString(value.matchMode) &&
    MATCH_MODES.includes(value.matchMode) &&
    isFiniteNumber(value.createdAt) &&
    (value.lastOpenedAt === undefined || isFiniteNumber(value.lastOpenedAt)) &&
    isFiniteNumber(value.openCount)
  )
}

/**
 * Validates a decrypted payload and upgrades older payload versions.
 * Unknown settings fall back to defaults instead of failing, so a payload
 * written by a newer build with extra settings still opens.
 */
export function migrateVaultData(raw: unknown): VaultData {
  if (!isRecord(raw)) throw new CoreError('invalid-data', 'payload is not an object')
  if (raw.version !== VAULT_DATA_VERSION) {
    throw new CoreError('unsupported-version', `payload version ${String(raw.version)}`)
  }
  if (!Array.isArray(raw.entries) || !raw.entries.every(isVaultEntry)) {
    throw new CoreError('invalid-data', 'bad entries')
  }
  const settings = isRecord(raw.settings) ? raw.settings : {}
  const openMode =
    isString(settings.openMode) && OPEN_MODES.includes(settings.openMode)
      ? (settings.openMode as OpenMode)
      : DEFAULT_SETTINGS.openMode
  const out: VaultSettings = {openMode}
  if (typeof settings.skipSaveNotice === 'boolean') out.skipSaveNotice = settings.skipSaveNotice
  return {version: VAULT_DATA_VERSION, entries: raw.entries, settings: out}
}
