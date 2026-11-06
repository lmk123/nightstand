import {looksLikeRecoveryCode} from './recovery-code.ts'

export const MIN_PASSPHRASE_LENGTH = 4

export type PassphraseProblem = 'too-short' | 'looks-like-recovery-code'

/**
 * Canonical form used for key derivation. Unicode-normalized (so the same
 * word typed through different input methods matches) and trimmed (a filter
 * box easily picks up a stray space).
 */
export function normalizePassphrase(passphrase: string): string {
  return passphrase.normalize('NFC').trim()
}

export function checkPassphrase(passphrase: string): PassphraseProblem | null {
  const normalized = normalizePassphrase(passphrase)
  if ([...normalized].length < MIN_PASSPHRASE_LENGTH) return 'too-short'
  // The filter box treats recovery-code-shaped input as a recovery attempt.
  if (looksLikeRecoveryCode(normalized)) return 'looks-like-recovery-code'
  return null
}
