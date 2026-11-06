import {describe, expect, it} from 'vitest'
import {
  checkPassphrase,
  formatRecoveryCode,
  generateRecoveryCode,
  looksLikeRecoveryCode,
  normalizePassphrase,
  normalizeRecoveryCode
} from '../src/index.ts'

describe('recovery codes', () => {
  it('are 8 groups of 4 Crockford characters (160 bits)', () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{4}$/)
  })
  it('are random', () => {
    const codes = new Set(Array.from({length: 50}, generateRecoveryCode))
    expect(codes.size).toBe(50)
  })
  it('normalize forgivingly', () => {
    const code = generateRecoveryCode()
    const canonical = code.replace(/-/g, '')
    expect(normalizeRecoveryCode(code)).toBe(canonical)
    expect(normalizeRecoveryCode(code.toLowerCase())).toBe(canonical)
    expect(normalizeRecoveryCode(` ${code.replace(/-/g, ' ')} `)).toBe(canonical)
    expect(normalizeRecoveryCode('O'.repeat(32))).toBe('0'.repeat(32))
    expect(normalizeRecoveryCode('il'.repeat(16))).toBe('1'.repeat(32))
    expect(formatRecoveryCode(canonical)).toBe(code)
  })
  it('reject wrong length or alphabet', () => {
    expect(normalizeRecoveryCode('ABCD')).toBeNull()
    expect(normalizeRecoveryCode('U'.repeat(32))).toBeNull()
    expect(normalizeRecoveryCode('A'.repeat(33))).toBeNull()
    expect(looksLikeRecoveryCode('notes')).toBe(false)
  })
})

describe('passphrases', () => {
  it('are NFC-normalized and trimmed', () => {
    expect(normalizePassphrase('  café ')).toBe('café')
  })
  it('must be at least 4 characters and not look like a recovery code', () => {
    expect(checkPassphrase('abc')).toBe('too-short')
    expect(checkPassphrase('  ab  ')).toBe('too-short')
    expect(checkPassphrase('书架笔记')).toBeNull()
    expect(checkPassphrase('notes')).toBeNull()
    expect(checkPassphrase(generateRecoveryCode())).toBe('looks-like-recovery-code')
  })
})
