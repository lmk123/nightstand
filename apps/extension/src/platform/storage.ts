import {
  migrateStoredVault,
  parseDecoyConfig,
  parseMatchTable,
  parsePrefs,
  type DecoyConfig,
  type MatchTable,
  type Prefs,
  type StoredVault
} from '@nightstand/core'

/**
 * Everything Nightstand keeps lives in `storage.local` (never `sync`), under
 * deliberately bland keys:
 *
 * - `shelf`    encrypted vault (absent until onboarding completes)
 * - `index`    hashed match table for the background
 * - `links`    decoy links + icon (plaintext, needed while locked; the page script reads it on a page it covers, for the icon)
 * - `state`    background bookkeeping (written by the background)
 * - `prefs`    cover / mute preferences (plaintext, needed while locked)
 *
 * The vault key is never stored anywhere.
 *
 * Retired keys (no longer written; removed on install/update):
 * - `throttle` failed-unlock back-off, dropped because it also locked out the owner
 */
const KEY = {
  shelf: 'shelf',
  index: 'index',
  links: 'links',
  state: 'state',
  prefs: 'prefs'
} as const

export const STORAGE_KEYS = KEY

async function get(key: string): Promise<unknown> {
  const result = await chrome.storage.local.get(key)
  return result[key]
}

/** Null when onboarding has not completed. Throws if the stored data is damaged or from a newer build. */
export async function loadShelf(): Promise<StoredVault | null> {
  const raw = await get(KEY.shelf)
  return raw === undefined ? null : migrateStoredVault(raw)
}

function parseStoredIndex(raw: unknown): MatchTable | null {
  if (raw === undefined) return null
  try {
    return parseMatchTable(raw)
  } catch {
    return null
  }
}

export async function loadIndex(): Promise<MatchTable | null> {
  return parseStoredIndex(await get(KEY.index))
}

/**
 * Vault and its match table, in one write. The popup leaves the table out
 * (`index` null) when the change can't affect it — opening an entry, a
 * setting, a new key wrap — so the background keeps its matcher cache.
 */
export async function saveShelfAndIndex(shelf: StoredVault, index: MatchTable | null): Promise<void> {
  const items: Record<string, unknown> = {[KEY.shelf]: shelf}
  if (index) items[KEY.index] = index
  await chrome.storage.local.set(items)
}

/** Just the match table: the popup re-syncs it with the vault on unlock. */
export async function saveIndex(index: MatchTable): Promise<void> {
  await chrome.storage.local.set({[KEY.index]: index})
}

/** Onboarding's single write: nothing is stored before this call. */
export async function saveInitialSetup(
  shelf: StoredVault,
  index: MatchTable,
  links: DecoyConfig
): Promise<void> {
  await chrome.storage.local.set({[KEY.shelf]: shelf, [KEY.index]: index, [KEY.links]: links})
}

export async function loadLinks(): Promise<DecoyConfig> {
  return parseDecoyConfig(await get(KEY.links))
}

export async function saveLinks(links: DecoyConfig): Promise<void> {
  await chrome.storage.local.set({[KEY.links]: links})
}

/** Absent (fresh install) or malformed fields read as their defaults. */
export async function loadPrefs(): Promise<Prefs> {
  return parsePrefs(await get(KEY.prefs))
}

/** Preferences and match table in one read: the page script needs both on every page load. */
export async function loadPrefsAndIndex(): Promise<{prefs: Prefs; index: MatchTable | null}> {
  const result = await chrome.storage.local.get([KEY.prefs, KEY.index])
  return {prefs: parsePrefs(result[KEY.prefs]), index: parseStoredIndex(result[KEY.index])}
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  await chrome.storage.local.set({[KEY.prefs]: prefs})
}

const RETIRED_KEYS = ['throttle']

/** Drops keys older builds wrote and nothing reads any more. */
export async function removeRetiredKeys(): Promise<void> {
  await chrome.storage.local.remove(RETIRED_KEYS)
}
