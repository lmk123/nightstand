import {CoreError} from './errors.ts'
import {isFiniteNumber, isRecord, isString, isStringArray} from './guards.ts'
import {hostCandidates, hostOf, normalizeExactUrl, normalizeHost, parseUserUrl} from './url.ts'

/** `site`: the whole site including every subdomain (default). `exact`: this one address only. */
export type MatchMode = 'site' | 'exact'

export interface VaultEntry {
  id: string
  url: string
  /** As the user typed it; empty means untitled (see `isUntitled`). */
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
  /**
   * The site's icon, captured from the browser's local icon cache when the
   * entry was saved (before its history, and with it the cached icon, is
   * deleted). Absent when none was cached or the browser has no such cache;
   * the list then shows a letter. See `isEntryIcon` for what is accepted.
   */
  icon?: string
}

/** Longest icon accepted, in characters (a 32×32 PNG is a few KB). */
export const MAX_ENTRY_ICON_LENGTH = 32_768

const ENTRY_ICON_PATTERN = /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/

/**
 * Only an inline base64 PNG / WebP / JPEG `data:` URL of bounded size: it is
 * rendered as an `<img src>`, and anything else (an `http:` URL from an
 * edited backup, say) would make the popup send a request.
 */
export function isEntryIcon(value: unknown): value is string {
  return isString(value) && value.length <= MAX_ENTRY_ICON_LENGTH && ENTRY_ICON_PATTERN.test(value)
}

export interface VaultSettings {
  /**
   * The user ticked "don't show again" on the notice shown before saving an
   * entry (saving wipes that site's / URL's existing history). Absent means
   * the notice is shown. Added without a payload version bump: it is optional,
   * and builds that don't know it simply drop it (the notice comes back).
   */
  skipSaveNotice?: boolean
  /**
   * The user ticked "don't show again" on the reminder shown after a save
   * (check the address bar yourself). Absent means it is shown. Optional,
   * like `skipSaveNotice`, so no payload version bump.
   */
  skipSaveCheck?: boolean
}

/**
 * Decrypted vault payload. `version` is the payload schema version:
 * 1 — initial; 2 — entries gain `extraHosts`; 3 — entries lose `note` and
 * `tags`; 4 — entries gain an optional `icon`. Optional fields whose loss
 * on an older build only costs a preference (`skipSaveNotice`,
 * `skipSaveCheck`) were added without a bump (see the storage-format rule
 * in CLAUDE.md). Settings once had an `openMode` (current tab / new tab /
 * incognito); entries now always open in a new tab. It was removed without a
 * bump too: older builds read its absence as their default, a new tab, and
 * `migrateVaultData` drops it from older payloads.
 */
export interface VaultData {
  version: 4
  entries: VaultEntry[]
  settings: VaultSettings
}

export const VAULT_DATA_VERSION = 4

export const DEFAULT_SETTINGS: VaultSettings = {}

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
  // No domain as a fallback: some are revealing on their own, and the title
  // is what the list shows. The UI names untitled entries.
  const title = input.title?.trim() ?? ''
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

/**
 * Whether the UI should show its neutral "untitled" name instead of `title`.
 * Entries saved before titles stopped defaulting to the domain carry the
 * host (or the URL) as their title; those count as untitled too, so the list
 * never shows a domain without needing a stored-data migration.
 */
export function isUntitled(entry: Pick<VaultEntry, 'url' | 'title'>): boolean {
  const title = entry.title.trim()
  return title === '' || title === entry.url || title === hostOf(entry.url)
}

/**
 * Applies an edit; the URL is re-validated. Throws `invalid-url`. The icon is
 * kept while the entry stays on the same host; a new host drops it (the
 * caller may capture a new one).
 */
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
  if (entry.icon !== undefined && hostOf(updated.url) === hostOf(entry.url)) updated.icon = entry.icon
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
 * a new extra host? A title change, dropped hosts, or a narrower scope that
 * `before` already covered (the whole site → one of its URLs or subdomains)
 * is not.
 */
export function widensScope(before: EntryScope | undefined, after: EntryScope): boolean {
  if (!before) return true
  // Each host `after` protects with its subdomains must already be one of
  // `before`'s, or under one.
  const old = entrySiteHosts(before)
  const coveredSite = (host: string) => hostCandidates(host).some((h) => old.includes(h))
  if (!entrySiteHosts(after).every(coveredSite)) return true
  return after.matchMode === 'exact' && !entryCoversUrl(before, after.url)
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

/** Gives entries (by id) an icon; ids not in the vault and invalid icons are ignored. */
export function setEntryIcons(data: VaultData, icons: ReadonlyMap<string, string>): VaultData {
  return {
    ...data,
    entries: data.entries.map((e) => {
      const icon = icons.get(e.id)
      return isEntryIcon(icon) ? {...e, icon} : e
    })
  }
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

/** A v3 entry: v4 fields minus `icon`. */
function isVaultEntryV3(value: unknown): value is Omit<VaultEntry, 'icon'> {
  return isRecord(value) && hasCommonEntryFields(value) && isStringArray(value.extraHosts)
}

/**
 * A current entry. An `icon` that isn't an acceptable `data:` URL doesn't
 * fail the entry; `migrateVaultData` drops it instead.
 */
export function isVaultEntry(value: unknown): value is VaultEntry {
  if (!isVaultEntryV3(value)) return false
  const {icon} = value as {icon?: unknown}
  return icon === undefined || isString(icon)
}

/** Copies only the current entry fields, so removed ones (`note`, `tags`) don't linger. */
function pickEntry(e: Omit<VaultEntry, 'extraHosts' | 'icon'>, extraHosts: string[], icon?: unknown): VaultEntry {
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
  if (isEntryIcon(icon)) entry.icon = icon
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
      // v3 → v4: entries gain an optional `icon` (none yet).
      if (!Array.isArray(raw.entries) || !raw.entries.every(isVaultEntryV3)) {
        throw new CoreError('invalid-data', 'bad entries')
      }
      entries = raw.entries.map((e) => pickEntry(e, [...e.extraHosts]))
      break
    case 4:
      if (!Array.isArray(raw.entries) || !raw.entries.every(isVaultEntry)) {
        throw new CoreError('invalid-data', 'bad entries')
      }
      entries = raw.entries.map((e) => pickEntry(e, [...e.extraHosts], e.icon))
      break
    default:
      throw new CoreError('unsupported-version', `payload version ${String(raw.version)}`)
  }
  const settings = isRecord(raw.settings) ? raw.settings : {}
  // Only known settings are copied, so a retired `openMode` is dropped.
  const out: VaultSettings = {...DEFAULT_SETTINGS}
  if (typeof settings.skipSaveNotice === 'boolean') out.skipSaveNotice = settings.skipSaveNotice
  if (typeof settings.skipSaveCheck === 'boolean') out.skipSaveCheck = settings.skipSaveCheck
  return {version: VAULT_DATA_VERSION, entries, settings: out}
}
