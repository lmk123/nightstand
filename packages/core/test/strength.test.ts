import {describe, expect, it} from 'vitest'
import {estimatePassphrase, strengthOfBits} from '../src/index.ts'

const strength = (p: string) => estimatePassphrase(p).strength

describe('estimatePassphrase', () => {
  it('rates empty, short and common passphrases as weak', () => {
    for (const p of ['', 'abcd', '1234', 'notes', 'password', 'PassWord', '5201314', 'qwertyuiop']) {
      expect(strength(p)).toBe('weak')
    }
  })
  it('barely counts repeats and runs', () => {
    expect(estimatePassphrase('aaaaaaaaaaaaaaaa').bits).toBeLessThan(25)
    expect(estimatePassphrase('abcdefghijklmnop').bits).toBeLessThan(25)
    expect(estimatePassphrase('9876543210').bits).toBeLessThan(15)
  })
  it('grows with length and character variety', () => {
    const short = estimatePassphrase('tidelamp').bits
    const longer = estimatePassphrase('tidelampquiver').bits
    const mixed = estimatePassphrase('Tide7lamp').bits
    expect(longer).toBeGreaterThan(short)
    expect(mixed).toBeGreaterThan(short)
  })
  it('counts a run of letters as about one word', () => {
    expect(strength('tide lamp')).toBe('fair')
    expect(estimatePassphrase('xkqvbmtz').bits).toBeLessThan(estimatePassphrase('Xk9qVb2m').bits)
  })
  it('rates several words with digits and spaces as strong', () => {
    expect(strength('tide lamp quiver 47')).toBe('strong')
    expect(strength('Kx9#mQ2v')).toBe('good')
  })
  it('ignores surrounding whitespace like the key derivation does', () => {
    expect(estimatePassphrase('  tidelamp ')).toEqual(estimatePassphrase('tidelamp'))
  })
  it('handles non-ASCII text', () => {
    expect(strength('床头柜')).toBe('weak')
    expect(estimatePassphrase('窗外的山和远处的海').bits).toBeGreaterThan(estimatePassphrase('床头柜').bits)
  })
})

describe('strengthOfBits', () => {
  it('maps thresholds', () => {
    expect(strengthOfBits(35.9)).toBe('weak')
    expect(strengthOfBits(36)).toBe('fair')
    expect(strengthOfBits(48)).toBe('good')
    expect(strengthOfBits(60)).toBe('strong')
  })
})
