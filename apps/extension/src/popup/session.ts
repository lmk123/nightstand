import {
  buildMatchTable,
  looksLikeRecoveryCode,
  newMatchSalt,
  openVault,
  sameMatchTable,
  sealVault,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  type MatchTable,
  type StoredVault,
  type VaultData
} from '@nightstand/core'
import {loadIndex, saveIndex, saveShelfAndIndex} from '@/platform/storage'

/**
 * An unlocked vault. Lives only in the popup's memory: closing the popup
 * destroys it, which is the lock. Never pass `dek` to storage or messaging.
 */
export interface Session {
  stored: StoredVault
  dek: CryptoKey
  data: VaultData
  /** Match-table salt, kept stable across rebuilds. */
  salt: string
  /** The match table as stored (null: none, or unreadable), to skip writes that change nothing. */
  index: MatchTable | null
}

export async function openSession(stored: StoredVault, dek: CryptoKey): Promise<Session> {
  const [data, index] = await Promise.all([openVault(stored, dek), loadIndex()])
  return {stored, dek, data, salt: index?.salt ?? newMatchSalt(), index}
}

/** The match table for `data`, and whether it differs from what is stored. */
async function rebuildIndex(session: Session, data: VaultData): Promise<{index: MatchTable; changed: boolean}> {
  const index = await buildMatchTable(data.entries, session.salt)
  return {index, changed: !session.index || !sameMatchTable(session.index, index)}
}

/**
 * Encrypts `data` and writes it, together with the rebuilt match table when
 * that changed. Most commits (opening an entry, a setting) don't change it,
 * and rewriting it would drop the background's matcher cache for nothing.
 */
export async function commit(session: Session, data: VaultData): Promise<Session> {
  const [stored, {index, changed}] = await Promise.all([
    sealVault(session.stored, session.dek, data),
    rebuildIndex(session, data)
  ])
  await saveShelfAndIndex(stored, changed ? index : null)
  return {...session, stored, data, index}
}

/** Same as `commit` but for a vault whose key wraps changed (passphrase or recovery code). */
export async function commitStored(session: Session, stored: StoredVault): Promise<Session> {
  return commit({...session, stored}, session.data)
}

/**
 * Brings the stored match table in line with the vault (on unlock). It can
 * only be rebuilt while unlocked, so one that is missing, unreadable or
 * hashed under older rules would otherwise stay until the next edit.
 */
export async function syncIndex(session: Session): Promise<Session> {
  const {index, changed} = await rebuildIndex(session, session.data)
  if (changed) await saveIndex(index)
  return {...session, index}
}

export interface UnlockResult {
  dek: CryptoKey
  via: 'passphrase' | 'recovery'
}

/**
 * One unlock attempt. Returns null for a wrong secret; the caller shows
 * nothing either way. There is deliberately no back-off: it would also
 * swallow the owner's correct passphrase after a few stray Enters in the
 * filter box, while a bystander guessing by hand gains little from it.
 */
export async function attemptUnlock(
  stored: StoredVault,
  input: string
): Promise<UnlockResult | null> {
  if (looksLikeRecoveryCode(input)) {
    const dek = await unlockWithRecoveryCode(stored, input)
    if (dek) return {dek, via: 'recovery'}
  }
  const dek = await unlockWithPassphrase(stored, input)
  return dek ? {dek, via: 'passphrase'} : null
}
