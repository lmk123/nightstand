import {randomBytes} from './encoding.ts'

/**
 * Recovery codes: 160 random bits in Crockford Base32 — 32 characters shown
 * as 8 groups of 4 (`XXXX-XXXX-…`). Input is forgiving: case, spaces and
 * hyphens are ignored, O reads as 0 and I/L as 1.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_BYTES = 20
const CODE_LENGTH = 32

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function formatRecoveryCode(canonical: string): string {
  return canonical.match(/.{1,4}/g)?.join('-') ?? canonical
}

/** A new code, formatted for display. */
export function generateRecoveryCode(): string {
  return formatRecoveryCode(encodeBase32(randomBytes(CODE_BYTES)))
}

/** Canonical 32-character form (the KDF input), or null if the input is not a recovery code. */
export function normalizeRecoveryCode(input: string): string | null {
  const compact = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (compact.length !== CODE_LENGTH) return null
  for (const char of compact) if (!ALPHABET.includes(char)) return null
  return compact
}

export function looksLikeRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input) !== null
}
