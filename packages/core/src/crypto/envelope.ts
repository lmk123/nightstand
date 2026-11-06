import {CoreError} from '../errors.ts'
import {migrateVaultData, type VaultData} from '../model.ts'
import {STORED_VAULT_VERSION, type Sealed, type StoredVault} from '../storage-format.ts'
import {base64ToBytes, bytesToBase64, randomBytes, utf8Decode, utf8Encode, type Bytes} from './encoding.ts'
import {DEFAULT_ITERATIONS, deriveKek, newKdfParams, type KdfParams} from './kdf.ts'
import {normalizePassphrase} from './passphrase.ts'
import {generateRecoveryCode, normalizeRecoveryCode} from './recovery-code.ts'

// Associated data binds each ciphertext to its role, so a wrapped key can
// never be swapped in as a payload or vice versa.
const AAD_WRAP_PASS = utf8Encode('nightstand/v1/dek/pass')
const AAD_WRAP_RECOVERY = utf8Encode('nightstand/v1/dek/recovery')
const AAD_PAYLOAD = utf8Encode('nightstand/v1/payload')

export interface EnvelopeOptions {
  /** PBKDF2 iterations. Defaults to 600k; tests pass a small number. */
  iterations?: number
}

async function generateDek(): Promise<CryptoKey> {
  // Extractable only so it can be wrapped (change passphrase, new recovery
  // code). It never leaves the popup's memory.
  return crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt'])
}

async function wrapDek(dek: CryptoKey, kek: CryptoKey, aad: Bytes): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.wrapKey('raw', dek, kek, {name: 'AES-GCM', iv, additionalData: aad})
  return {iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct))}
}

async function unwrapDek(sealed: Sealed, kek: CryptoKey, aad: Bytes): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      base64ToBytes(sealed.ct),
      kek,
      {name: 'AES-GCM', iv: base64ToBytes(sealed.iv), additionalData: aad},
      {name: 'AES-GCM', length: 256},
      true,
      ['encrypt', 'decrypt']
    )
  } catch {
    // Wrong secret (GCM tag mismatch) or corrupt data: both are "no".
    return null
  }
}

async function wrapForSecret(
  dek: CryptoKey,
  secret: string,
  aad: Bytes,
  iterations: number
): Promise<{kdf: KdfParams; sealed: Sealed}> {
  const kdf = newKdfParams(iterations)
  const kek = await deriveKek(secret, kdf)
  return {kdf, sealed: await wrapDek(dek, kek, aad)}
}

async function sealPayload(dek: CryptoKey, data: VaultData): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt(
    {name: 'AES-GCM', iv, additionalData: AAD_PAYLOAD},
    dek,
    utf8Encode(JSON.stringify(data))
  )
  return {iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct))}
}

export interface CreatedVault {
  stored: StoredVault
  dek: CryptoKey
  /** Formatted for display. Shown once; never stored. */
  recoveryCode: string
}

/** Creates a new vault: fresh DEK, passphrase wrap, recovery-code wrap, encrypted payload. */
export async function createVault(
  passphrase: string,
  data: VaultData,
  options: EnvelopeOptions = {}
): Promise<CreatedVault> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const dek = await generateDek()
  const recoveryCode = generateRecoveryCode()
  const canonicalRecovery = normalizeRecoveryCode(recoveryCode)
  if (!canonicalRecovery) throw new Error('generated recovery code failed to normalize')
  const [pass, recovery, payload] = await Promise.all([
    wrapForSecret(dek, normalizePassphrase(passphrase), AAD_WRAP_PASS, iterations),
    wrapForSecret(dek, canonicalRecovery, AAD_WRAP_RECOVERY, iterations),
    sealPayload(dek, data)
  ])
  return {
    stored: {
      version: STORED_VAULT_VERSION,
      kdf: {pass: pass.kdf, recovery: recovery.kdf},
      wrapped: {pass: pass.sealed, recovery: recovery.sealed},
      payload
    },
    dek,
    recoveryCode
  }
}

/** The DEK, or null when the passphrase is wrong. Never throws for a wrong passphrase. */
export async function unlockWithPassphrase(
  stored: StoredVault,
  passphrase: string
): Promise<CryptoKey | null> {
  const kek = await deriveKek(normalizePassphrase(passphrase), stored.kdf.pass)
  return unwrapDek(stored.wrapped.pass, kek, AAD_WRAP_PASS)
}

/** The DEK, or null when the input is not a recovery code or not the right one. */
export async function unlockWithRecoveryCode(
  stored: StoredVault,
  recoveryCode: string
): Promise<CryptoKey | null> {
  const canonical = normalizeRecoveryCode(recoveryCode)
  if (!canonical) return null
  const kek = await deriveKek(canonical, stored.kdf.recovery)
  return unwrapDek(stored.wrapped.recovery, kek, AAD_WRAP_RECOVERY)
}

/** Decrypts and validates the payload. Throws `decrypt-failed` / `invalid-data` / `unsupported-version`. */
export async function openVault(stored: StoredVault, dek: CryptoKey): Promise<VaultData> {
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      {name: 'AES-GCM', iv: base64ToBytes(stored.payload.iv), additionalData: AAD_PAYLOAD},
      dek,
      base64ToBytes(stored.payload.ct)
    )
  } catch {
    throw new CoreError('decrypt-failed')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(utf8Decode(new Uint8Array(plaintext)))
  } catch {
    throw new CoreError('invalid-data', 'payload is not JSON')
  }
  return migrateVaultData(parsed)
}

/** Re-encrypts the payload (fresh IV); key wraps are unchanged. */
export async function sealVault(
  stored: StoredVault,
  dek: CryptoKey,
  data: VaultData
): Promise<StoredVault> {
  return {...stored, payload: await sealPayload(dek, data)}
}

/** Replaces the passphrase wrap. The old passphrase stops working; the recovery code still works. */
export async function changePassphrase(
  stored: StoredVault,
  dek: CryptoKey,
  newPassphrase: string,
  options: EnvelopeOptions = {}
): Promise<StoredVault> {
  const {kdf, sealed} = await wrapForSecret(
    dek,
    normalizePassphrase(newPassphrase),
    AAD_WRAP_PASS,
    options.iterations ?? stored.kdf.pass.iterations
  )
  return {...stored, kdf: {...stored.kdf, pass: kdf}, wrapped: {...stored.wrapped, pass: sealed}}
}

/** Issues a new recovery code; the old one stops working. */
export async function rotateRecoveryCode(
  stored: StoredVault,
  dek: CryptoKey,
  options: EnvelopeOptions = {}
): Promise<{stored: StoredVault; recoveryCode: string}> {
  const recoveryCode = generateRecoveryCode()
  const canonical = normalizeRecoveryCode(recoveryCode)
  if (!canonical) throw new Error('generated recovery code failed to normalize')
  const {kdf, sealed} = await wrapForSecret(
    dek,
    canonical,
    AAD_WRAP_RECOVERY,
    options.iterations ?? stored.kdf.recovery.iterations
  )
  return {
    stored: {...stored, kdf: {...stored.kdf, recovery: kdf}, wrapped: {...stored.wrapped, recovery: sealed}},
    recoveryCode
  }
}
