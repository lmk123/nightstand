import {describe, expect, it} from 'vitest'
import {defaultDecoyConfig, filterDecoyLinks, makeDecoyLink, parseDecoyConfig} from '../src/index.ts'

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
