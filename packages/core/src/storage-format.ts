import {CoreError} from './errors.ts'
import {isFiniteNumber, isRecord, isString} from './guards.ts'
import type {KdfParams} from './crypto/kdf.ts'

/** AES-GCM output: base64 IV (12 bytes) and base64 ciphertext+tag. */
export interface Sealed {
  iv: string
  ct: string
}

/**
 * The encrypted vault as stored in `storage.local` and embedded in backups.
 *
 * Envelope encryption: a random data key (DEK) encrypts `payload`; the DEK is
 * wrapped twice — once with a key derived from the passphrase, once with a
 * key derived from the recovery code.
 */
export interface StoredVaultV1 {
  version: 1
  kdf: {pass: KdfParams; recovery: KdfParams}
  wrapped: {pass: Sealed; recovery: Sealed}
  payload: Sealed
}

export type StoredVault = StoredVaultV1

export const STORED_VAULT_VERSION = 1

function isKdfParams(value: unknown): value is KdfParams {
  return (
    isRecord(value) &&
    value.algorithm === 'PBKDF2-SHA256' &&
    isFiniteNumber(value.iterations) &&
    Number.isInteger(value.iterations) &&
    value.iterations >= 1 &&
    isString(value.salt)
  )
}

function isSealed(value: unknown): value is Sealed {
  return isRecord(value) && isString(value.iv) && isString(value.ct)
}

function isStoredVaultV1(value: Record<string, unknown>): value is Record<string, unknown> & StoredVaultV1 {
  const {kdf, wrapped} = value
  return (
    value.version === 1 &&
    isRecord(kdf) &&
    isKdfParams(kdf.pass) &&
    isKdfParams(kdf.recovery) &&
    isRecord(wrapped) &&
    isSealed(wrapped.pass) &&
    isSealed(wrapped.recovery) &&
    isSealed(value.payload)
  )
}

/**
 * Validates a stored vault and upgrades it to the current version, one step
 * at a time. Add a `case` per new version; never edit an old step.
 */
export function migrateStoredVault(raw: unknown): StoredVault {
  if (!isRecord(raw)) throw new CoreError('invalid-data', 'stored vault is not an object')
  switch (raw.version) {
    case 1:
      if (!isStoredVaultV1(raw)) throw new CoreError('invalid-data', 'malformed v1 vault')
      return {
        version: 1,
        kdf: {pass: {...raw.kdf.pass}, recovery: {...raw.kdf.recovery}},
        wrapped: {pass: {...raw.wrapped.pass}, recovery: {...raw.wrapped.recovery}},
        payload: {...raw.payload}
      }
    default:
      // A newer numeric version means "written by a newer build"; anything
      // else is just not a vault.
      if (isFiniteNumber(raw.version) && raw.version > STORED_VAULT_VERSION) {
        throw new CoreError('unsupported-version', `stored vault version ${raw.version}`)
      }
      throw new CoreError('invalid-data', 'not a stored vault')
  }
}
