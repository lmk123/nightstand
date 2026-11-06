import {
  INITIAL_THROTTLE,
  migrateStoredVault,
  parseDecoyConfig,
  parseMatchTable,
  parseThrottle,
  type DecoyConfig,
  type MatchTable,
  type StoredVault,
  type UnlockThrottle
} from '@nightstand/core'

/**
 * Everything Nightstand keeps lives in `storage.local` (never `sync`), under
 * deliberately bland keys:
 *
 * - `shelf`    encrypted vault (absent until onboarding completes)
 * - `index`    hashed match table for the background
 * - `links`    decoy links + icon + disguise flag (plaintext, needed while locked)
 * - `throttle` failed-unlock back-off (written by the popup)
 * - `state`    background bookkeeping (written by the background)
 *
 * The vault key is never stored anywhere.
 */
const KEY = {
  shelf: 'shelf',
  index: 'index',
  links: 'links',
  throttle: 'throttle',
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

export async function loadThrottle(): Promise<UnlockThrottle> {
  return parseThrottle(await get(KEY.throttle))
}

export async function saveThrottle(throttle: UnlockThrottle): Promise<void> {
  await chrome.storage.local.set({[KEY.throttle]: throttle})
}

export async function resetThrottle(): Promise<void> {
  await saveThrottle({...INITIAL_THROTTLE})
}
