import {describe, expect, it} from 'vitest'
import {buildMatchTable, createMatcher, emptyMatchTable, hashMatchValue, newMatchSalt, parseMatchTable, isCoreError} from '../src/index.ts'

async function matcherFor(entries: {url: string; matchMode: 'site' | 'exact'}[]) {
  return createMatcher(await buildMatchTable(entries))
}

describe('site matching', () => {
  it('matches the host, www and every subdomain', async () => {
    const m = await matcherFor([{url: 'https://example.com/', matchMode: 'site'}])
    for (const url of [
      'https://example.com/',
      'https://www.example.com/foo',
      'http://EXAMPLE.com/x?y#z',
      'https://a.b.example.com/',
      'https://example.com:8443/'
    ]) {
      expect(await m.matches(url), url).toBe(true)
    }
  })
  it('does not match look-alikes or parents', async () => {
    const m = await matcherFor([{url: 'https://example.com/', matchMode: 'site'}])
    for (const url of [
      'https://evil-example.com/',
      'https://example.com.evil.org/',
      'https://notexample.com/',
      'https://example.org/',
      'https://com/'
    ]) {
      expect(await m.matches(url), url).toBe(false)
    }
  })
  it('a subdomain entry does not cover its parent or siblings', async () => {
    const m = await matcherFor([{url: 'https://blog.example.com/', matchMode: 'site'}])
    expect(await m.matches('https://x.blog.example.com/')).toBe(true)
    expect(await m.matches('https://example.com/')).toBe(false)
    expect(await m.matches('https://shop.example.com/')).toBe(false)
  })
  it('matches IDN hosts regardless of how they are written', async () => {
    const m = await matcherFor([{url: 'https://例子.测试/', matchMode: 'site'}])
    expect(await m.matches('https://www.例子.测试/page')).toBe(true)
    expect(await m.matches('https://xn--fsqu00a.xn--0zwm56d/')).toBe(true)
  })
  it('never matches non-http URLs', async () => {
    const m = await matcherFor([{url: 'https://example.com/', matchMode: 'site'}])
    expect(await m.matches('chrome-extension://example.com/x')).toBe(false)
    expect(await m.matches('not a url')).toBe(false)
  })
  it('matchesHost works on bare hosts', async () => {
    const m = await matcherFor([{url: 'https://example.com/', matchMode: 'site'}])
    expect(await m.matchesHost('WWW.Example.com')).toBe(true)
    expect(await m.matchesHost('evil-example.com')).toBe(false)
  })
})

describe('exact matching', () => {
  it('matches the same address, ignoring fragment, scheme and www', async () => {
    const m = await matcherFor([{url: 'https://example.com/page?q=1', matchMode: 'exact'}])
    expect(await m.matches('https://example.com/page?q=1#top')).toBe(true)
    expect(await m.matches('http://www.example.com/page?q=1')).toBe(true)
  })
  it('does not match other paths, queries, ports or the site', async () => {
    const m = await matcherFor([{url: 'https://example.com/page?q=1', matchMode: 'exact'}])
    expect(await m.matches('https://example.com/page?q=2')).toBe(false)
    expect(await m.matches('https://example.com/page')).toBe(false)
    expect(await m.matches('https://example.com/')).toBe(false)
    expect(await m.matches('https://example.com:8443/page?q=1')).toBe(false)
    expect(await m.matchesHost('example.com')).toBe(false)
  })
  it('treats the address with and without a trailing slash as the same', async () => {
    for (const entered of ['https://example.com/a/b', 'https://example.com/a/b/']) {
      const m = await matcherFor([{url: entered, matchMode: 'exact'}])
      expect(await m.matches('https://example.com/a/b')).toBe(true)
      expect(await m.matches('https://example.com/a/b/')).toBe(true)
      expect(await m.matches('https://example.com/a/b/c')).toBe(false)
      expect(await m.matches('https://example.com/a')).toBe(false)
    }
  })
  it('still matches tables that hashed the trailing slash as typed', async () => {
    // Tables written before trailing slashes were ignored; the background
    // cannot rebuild them until the vault is next unlocked and saved.
    const salt = newMatchSalt()
    const legacy = {version: 1 as const, salt, site: [], exact: [await hashMatchValue(salt, 'exact', 'example.com/a/b/?q=1')]}
    const m = createMatcher(legacy)
    expect(await m.matches('https://example.com/a/b?q=1')).toBe(true)
    expect(await m.matches('https://example.com/a/b/?q=1')).toBe(true)
    expect(await m.matches('https://example.com/a/b/?q=2')).toBe(false)
  })
})

describe('table', () => {
  it('stores only salted hashes, sorted and de-duplicated', async () => {
    const table = await buildMatchTable([
      {url: 'https://example.com/', matchMode: 'site'},
      {url: 'https://www.example.com/other', matchMode: 'site'},
      {url: 'https://example.org/a', matchMode: 'exact'}
    ])
    expect(table.site).toHaveLength(1)
    expect(table.exact).toHaveLength(1)
    expect(JSON.stringify(table)).not.toContain('example')
    expect(table.site[0]).toMatch(/^[0-9a-f]{64}$/)
  })
  it('different salts give different hashes; same salt is stable', async () => {
    const entries = [{url: 'https://example.com/', matchMode: 'site' as const}]
    const salt = newMatchSalt()
    const a = await buildMatchTable(entries, salt)
    const b = await buildMatchTable(entries, salt)
    const c = await buildMatchTable(entries)
    expect(a.site).toEqual(b.site)
    expect(c.site).not.toEqual(a.site)
  })
  it('an empty table matches nothing', async () => {
    const m = createMatcher(emptyMatchTable())
    expect(m.isEmpty).toBe(true)
    expect(await m.matches('https://example.com/')).toBe(false)
  })
  it('parseMatchTable round-trips and rejects garbage', async () => {
    const table = await buildMatchTable([{url: 'https://example.com/', matchMode: 'site'}])
    expect(parseMatchTable(JSON.parse(JSON.stringify(table)))).toEqual(table)
    for (const bad of [null, {}, {version: 2, salt: 'x', site: [], exact: []}, {version: 1, salt: 1, site: [], exact: []}]) {
      try {
        parseMatchTable(bad)
        expect.unreachable()
      } catch (error) {
        expect(isCoreError(error, 'invalid-data')).toBe(true)
      }
    }
  })
})
