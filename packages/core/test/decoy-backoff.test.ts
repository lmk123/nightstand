import {describe, expect, it} from 'vitest'
import {
  INITIAL_THROTTLE,
  MAX_DELAY_MS,
  canAttemptUnlock,
  defaultDecoyConfig,
  delayAfterFailures,
  filterDecoyLinks,
  makeDecoyLink,
  parseDecoyConfig,
  parseThrottle,
  recordUnlockFailure
} from '../src/index.ts'

describe('decoy links', () => {
  it('defaults to a handful of ordinary links', () => {
    const config = defaultDecoyConfig()
    expect(config.links.map((l) => l.title)).toEqual(['GitHub', 'MDN Web Docs', 'Google Docs', 'Gmail'])
    expect(config).toMatchObject({icon: 'nightstand'})
  })
  it('filters on title and url', () => {
    const {links} = defaultDecoyConfig()
    expect(filterDecoyLinks(links, '').length).toBe(4)
    expect(filterDecoyLinks(links, 'GOOGLE').map((l) => l.id)).toEqual(['docs', 'gmail'])
    expect(filterDecoyLinks(links, 'mozilla').map((l) => l.id)).toEqual(['mdn'])
    expect(filterDecoyLinks(links, 'lantern')).toEqual([])
  })
  it('makeDecoyLink normalizes and validates', () => {
    expect(makeDecoyLink('', 'example.com', 'i')).toEqual({id: 'i', title: 'example.com', url: 'https://example.com/'})
    expect(makeDecoyLink('x', 'ftp://example.com')).toBeNull()
  })
  it('parseDecoyConfig falls back field by field and drops the old disguise flag', () => {
    expect(parseDecoyConfig(undefined)).toEqual(defaultDecoyConfig())
    const parsed = parseDecoyConfig({links: [{id: 'a', title: 'A', url: 'https://a.test/'}, {bad: 1}], icon: 'nope', disguise: false})
    expect(parsed).toEqual({version: 1, links: [{id: 'a', title: 'A', url: 'https://a.test/'}], icon: 'nightstand'})
  })
})

describe('unlock back-off', () => {
  it('lets the first three failures through, then doubles up to a cap', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(delayAfterFailures)).toEqual([0, 0, 0, 1000, 2000, 4000, 8000])
    expect(delayAfterFailures(100)).toBe(MAX_DELAY_MS)
  })
  it('blocks attempts until the window passes', () => {
    let state = INITIAL_THROTTLE
    for (let i = 0; i < 4; i++) state = recordUnlockFailure(state, 1000)
    expect(state).toEqual({failures: 4, nextAllowedAt: 2000})
    expect(canAttemptUnlock(state, 1999)).toBe(false)
    expect(canAttemptUnlock(state, 2000)).toBe(true)
  })
  it('parses stored state leniently', () => {
    expect(parseThrottle({failures: 2, nextAllowedAt: 5})).toEqual({failures: 2, nextAllowedAt: 5})
    expect(parseThrottle('x')).toEqual(INITIAL_THROTTLE)
  })
})
