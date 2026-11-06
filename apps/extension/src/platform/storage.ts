import {
  migrateStoredVault,
  parseDecoyConfig,
  parseMatchTable,
  type DecoyConfig,
  type MatchTable,
  type StoredVault
} from '@nightstand/core'

/**
 * Everything Nightstand keeps lives in `storage.local` (never `sync`), under
 * deliberately bland keys:
 *
 * - `shelf`    encrypted vault (absent until onboarding completes)
 * - `index`    hashed match table for the background
 * - `links`    decoy links + icon (plaintext, needed while locked)
 * - `state`    background bookkeeping (written by the background)
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
  state: 'state'
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

export async function loadIndex(): Promise<MatchTable | null> {
  const raw = await get(KEY.index)
  if (raw === undefined) return null
  try {
    return parseMatchTable(raw)
  } catch {
    return null
  }
}

/** Vault and its match table are always written together. */
export async function saveShelfAndIndex(shelf: StoredVault, index: MatchTable): Promise<void> {
  await chrome.storage.local.set({[KEY.shelf]: shelf, [KEY.index]: index})
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

const RETIRED_KEYS = ['throttle']

/** Drops keys older builds wrote and nothing reads any more. */
export async function removeRetiredKeys(): Promise<void> {
  await chrome.storage.local.remove(RETIRED_KEYS)
}
