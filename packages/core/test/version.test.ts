import {describe, expect, it} from 'vitest'
import {compareVersions} from '../src/index.ts'

describe('compareVersions', () => {
  it('orders by each part as a number, not as text', () => {
    expect(compareVersions('0.3.0', '0.3.1')).toBe(-1)
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('1.0', '0.99.99.99')).toBe(1)
  })
  it('counts missing parts as 0', () => {
    expect(compareVersions('0.3', '0.3.0')).toBe(0)
    expect(compareVersions('0.3.0.1', '0.3')).toBe(1)
  })
  it('counts a part that is not a number as 0', () => {
    expect(compareVersions('', '0.0.0')).toBe(0)
    expect(compareVersions('0.x.1', '0.0.1')).toBe(0)
  })
})
