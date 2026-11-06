import {normalizePassphrase} from './passphrase.ts'

/**
 * Rough passphrase strength, shown as a hint while choosing one (never
 * enforced beyond MIN_PASSPHRASE_LENGTH).
 *
 * Each character adds log2 of the pool its character classes span; a
 * character that repeats or continues a run (`aaa`, `abc`, `321`) adds almost
 * nothing; a run of letters is capped at roughly one dictionary word (or
 * ~2.6 bits per letter for long runs, as in English text), since it may well
 * be one; and a short list of the most common passwords scores as very weak.
 * It knows no actual dictionary, names or dates, so treat it as a hint.
 *
 * What the score means: every unlock attempt costs PBKDF2-SHA256 with 600k
 * iterations, so one high-end GPU tries on the order of 10^4 guesses per
 * second against a copied vault. 36 bits ≈ weeks, 48 bits ≈ centuries.
 */
export type PassphraseStrength = 'weak' | 'fair' | 'good' | 'strong'

export interface PassphraseEstimate {
  /** Estimated entropy in bits. */
  bits: number
  strength: PassphraseStrength
}

const FAIR_BITS = 36
const GOOD_BITS = 48
const STRONG_BITS = 60
const COMMON_BITS = 10
/** A run of letters is worth at most a pick from a ~65k-word dictionary… */
const WORD_BITS = 16
/** …or, for longer runs, about what English text carries per letter. */
const LETTER_BITS_IN_WORDS = 2.6

/** Pool sizes per character class. Non-ASCII (e.g. CJK) is kept small: such passphrases are usually phrases. */
const POOL = {lower: 26, upper: 26, digit: 10, symbol: 33, other: 100} as const

const COMMON = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '111111', '000000', '666666', '888888',
  '123123', '654321', '112233', '5201314', '1314520', 'woaini', 'woaini1314', 'iloveyou', 'password',
  'passw0rd', 'password1', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'qazwsx',
  '1qaz2wsx', 'abc123', 'a123456', 'aa123456', '123qwe', 'qwe123', 'admin', 'letmein', 'welcome',
  'monkey', 'dragon', 'sunshine', 'princess', 'football', 'baseball', 'nightstand'
])

function poolSize(chars: readonly string[]): number {
  let lower = false
  let upper = false
  let digit = false
  let symbol = false
  let other = false
  for (const c of chars) {
    if (c >= 'a' && c <= 'z') lower = true
    else if (c >= 'A' && c <= 'Z') upper = true
    else if (c >= '0' && c <= '9') digit = true
    else if (c >= ' ' && c <= '~') symbol = true
    else other = true
  }
  return (
    (lower ? POOL.lower : 0) +
    (upper ? POOL.upper : 0) +
    (digit ? POOL.digit : 0) +
    (symbol ? POOL.symbol : 0) +
    (other ? POOL.other : 0)
  )
}

export function strengthOfBits(bits: number): PassphraseStrength {
  if (bits >= STRONG_BITS) return 'strong'
  if (bits >= GOOD_BITS) return 'good'
  if (bits >= FAIR_BITS) return 'fair'
  return 'weak'
}

export function estimatePassphrase(passphrase: string): PassphraseEstimate {
  const chars = [...normalizePassphrase(passphrase)]
  if (chars.length === 0) return {bits: 0, strength: 'weak'}
  if (COMMON.has(chars.join('').toLowerCase())) return {bits: COMMON_BITS, strength: 'weak'}

  const full = Math.log2(poolSize(chars))
  const seen = new Set<string>()
  let previous: number | undefined
  let bits = 0
  // A run of ASCII letters may be a dictionary word: cap what it adds.
  let run = {bits: 0, length: 0}
  const endRun = () => {
    bits += Math.min(run.bits, Math.max(WORD_BITS, run.length * LETTER_BITS_IN_WORDS))
    run = {bits: 0, length: 0}
  }
  for (const c of chars) {
    const code = c.codePointAt(0) ?? 0
    let charBits: number
    if (previous !== undefined && Math.abs(code - previous) <= 1) charBits = 1
    else if (seen.has(c)) charBits = full / 2
    else charBits = full
    if (/[a-z]/i.test(c)) {
      run.bits += charBits
      run.length++
    } else {
      endRun()
      bits += charBits
    }
    seen.add(c)
    previous = code
  }
  endRun()
  return {bits, strength: strengthOfBits(bits)}
}
