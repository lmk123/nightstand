import {describe, expect, it} from 'vitest'
import {hostCandidates, hostOf, normalizeExactUrl, normalizeHost, parseUserUrl} from '../src/index.ts'

describe('parseUserUrl', () => {
  it('adds https:// when no scheme is given', () => {
    expect(parseUserUrl('example.com/foo')?.href).toBe('https://example.com/foo')
    expect(parseUserUrl('  example.com  ')?.href).toBe('https://example.com/')
  })
  it('keeps an explicit http(s) scheme', () => {
    expect(parseUserUrl('http://example.com')?.href).toBe('http://example.com/')
  })
  it('treats host:port as a host, not a scheme', () => {
    expect(parseUserUrl('localhost:3000')?.host).toBe('localhost:3000')
  })
  it('rejects non-http schemes and garbage', () => {
    expect(parseUserUrl('ftp://example.com')).toBeNull()
    expect(parseUserUrl('javascript://alert(1)')).toBeNull()
    expect(parseUserUrl('')).toBeNull()
    expect(parseUserUrl('http://')).toBeNull()
  })
})

describe('normalizeHost / hostOf', () => {
  it('lower-cases and strips a single leading www.', () => {
    expect(normalizeHost('WWW.Example.COM')).toBe('example.com')
    expect(normalizeHost('www.www.example.com')).toBe('www.example.com')
    expect(hostOf('https://WWW.EXAMPLE.com/Path')).toBe('example.com')
  })
  it('does not strip www when it is the whole name or not a label', () => {
    expect(normalizeHost('www')).toBe('www')
    expect(normalizeHost('wwwexample.com')).toBe('wwwexample.com')
  })
  it('drops a trailing dot', () => {
    expect(normalizeHost('example.com.')).toBe('example.com')
  })
  it('converts IDN to punycode', () => {
    expect(normalizeHost('例子.测试')).toBe('xn--fsqu00a.xn--0zwm56d')
    expect(hostOf('https://www.例子.测试/')).toBe('xn--fsqu00a.xn--0zwm56d')
    expect(hostOf('https://Bücher.example/')).toBe('xn--bcher-kva.example')
  })
  it('ignores the port', () => {
    expect(hostOf('https://example.com:8443/x')).toBe('example.com')
  })
  it('returns null for non-http URLs', () => {
    expect(hostOf('chrome-extension://abc/popup.html')).toBeNull()
    expect(hostOf('file:///etc/hosts')).toBeNull()
    expect(hostOf('about:blank')).toBeNull()
  })
})

describe('normalizeExactUrl', () => {
  it('drops the fragment but keeps the query', () => {
    expect(normalizeExactUrl('https://example.com/a?b=1#c')).toBe('example.com/a?b=1')
  })
  it('ignores scheme, case of host, www and the default port', () => {
    const expected = 'example.com/A'
    expect(normalizeExactUrl('http://WWW.example.com:80/A')).toBe(expected)
    expect(normalizeExactUrl('https://example.com:443/A')).toBe(expected)
  })
  it('keeps a non-default port and path case', () => {
    expect(normalizeExactUrl('https://example.com:8443/A')).toBe('example.com:8443/A')
  })
  it('drops credentials', () => {
    expect(normalizeExactUrl('https://user:pw@example.com/')).toBe('example.com/')
  })
  it('distinguishes queries', () => {
    expect(normalizeExactUrl('https://example.com/?a=1')).not.toBe(
      normalizeExactUrl('https://example.com/?a=2')
    )
  })
})

describe('hostCandidates', () => {
  it('walks parent domains on label boundaries', () => {
    expect(hostCandidates('a.b.example.com')).toEqual(['a.b.example.com', 'b.example.com', 'example.com'])
  })
  it('never yields the bare TLD', () => {
    expect(hostCandidates('example.com')).toEqual(['example.com'])
  })
  it('never produces a partial-label suffix', () => {
    expect(hostCandidates('evil-example.com')).toEqual(['evil-example.com'])
  })
  it('keeps single-label hosts and IP literals whole', () => {
    expect(hostCandidates('localhost')).toEqual(['localhost'])
    expect(hostCandidates('192.168.1.10')).toEqual(['192.168.1.10'])
    expect(hostCandidates('[::1]')).toEqual(['[::1]'])
  })
})
