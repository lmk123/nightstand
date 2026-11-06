import {base64ToBytes, bytesToBase64, randomBytes, utf8Encode} from './encoding.ts'

/** Parameters stored next to each wrapped key so they can change in later versions. */
export interface KdfParams {
  algorithm: 'PBKDF2-SHA256'
  iterations: number
  /** Base64, 16 random bytes. */
  salt: string
}

/** OWASP 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const DEFAULT_ITERATIONS = 600_000
export const MIN_ITERATIONS = 1

export function newKdfParams(iterations: number = DEFAULT_ITERATIONS): KdfParams {
  return {algorithm: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(randomBytes(16))}
}

/**
 * Derives a non-extractable AES-256-GCM key-encryption key from a secret
 * (passphrase or canonical recovery code).
 */
export async function deriveKek(secret: string, params: KdfParams): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    utf8Encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64ToBytes(params.salt),
      iterations: params.iterations
    },
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['wrapKey', 'unwrapKey']
  )
}
