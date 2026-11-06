import {
  buildMatchTable,
  canAttemptUnlock,
  looksLikeRecoveryCode,
  newMatchSalt,
  openVault,
  recordUnlockFailure,
  sealVault,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  type StoredVault,
  type VaultData
} from '@nightstand/core'
import {loadIndex, loadThrottle, resetThrottle, saveShelfAndIndex, saveThrottle} from '@/platform/storage'

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
}

export async function openSession(stored: StoredVault, dek: CryptoKey): Promise<Session> {
  const [data, index] = await Promise.all([openVault(stored, dek), loadIndex()])
  return {stored, dek, data, salt: index?.salt ?? newMatchSalt()}
}

/** Encrypts `data`, rebuilds the match table and writes both. */
export async function commit(session: Session, data: VaultData): Promise<Session> {
  const [stored, index] = await Promise.all([
    sealVault(session.stored, session.dek, data),
    buildMatchTable(data.entries, session.salt)
  ])
  await saveShelfAndIndex(stored, index)
  return {...session, stored, data}
}

/** Same as `commit` but for a vault whose key wraps changed (passphrase or recovery code). */
export async function commitStored(session: Session, stored: StoredVault): Promise<Session> {
  return commit({...session, stored}, session.data)
}

export interface UnlockResult {
  dek: CryptoKey
  via: 'passphrase' | 'recovery'
}

/**
 * One unlock attempt with silent back-off. Returns null for a wrong secret
 * *and* while backing off, so callers cannot (and must not) tell the user
 * which one happened.
 */
export async function attemptUnlock(
  stored: StoredVault,
  input: string
): Promise<UnlockResult | null> {
  const throttle = await loadThrottle()
  if (!canAttemptUnlock(throttle, Date.now())) return null

  let result: UnlockResult | null = null
  if (looksLikeRecoveryCode(input)) {
    const dek = await unlockWithRecoveryCode(stored, input)
    if (dek) result = {dek, via: 'recovery'}
  }
  if (!result) {
    const dek = await unlockWithPassphrase(stored, input)
    if (dek) result = {dek, via: 'passphrase'}
  }

  if (result) await resetThrottle()
  else await saveThrottle(recordUnlockFailure(throttle, Date.now()))
  return result
}
