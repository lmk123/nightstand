import {describe, expect, it} from 'vitest'
import {CORE_VERSION} from '../src/index.ts'

describe('core', () => {
  it('loads', () => {
    expect(CORE_VERSION).toBe(1)
  })
})
