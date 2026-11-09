import {describe, expect, it} from 'vitest'
import {
  addEntry,
  clearIncognitoRetired,
  createEntry,
  editEntry,
  entryCoversUrl,
  emptyVaultData,
  findDuplicate,
  isCoreError,
  isEntryIcon,
  isUntitled,
  MAX_ENTRY_ICON_LENGTH,
  migrateVaultData,
  parseExtraHosts,
  recordOpen,
  removeEntry,
  replaceEntry,
  searchEntries,
  setEntryIcons,
  updateSettings,
  widensScope
} from '../src/index.ts'

const NOW = 1_700_000_000_000
const ICON = 'data:image/png;base64,iVBORw0KGgo='

describe('createEntry', () => {
  it('normalizes input and fills defaults', () => {
    const e = createEntry({url: ' example.com/foo '}, NOW, 'id1')
    expect(e).toEqual({
      id: 'id1',
      url: 'https://example.com/foo',
      title: '',
      matchMode: 'site',
      extraHosts: [],
      createdAt: NOW,
      openCount: 0
    })
  })
  it('normalizes extra hosts and drops the entry\'s own host in site mode', () => {
    const e = createEntry({url: 'example.com', extraHosts: ['Video.TWIMG.com', 'https://pay.example.net/x?y=1', 'www.example.com', '*.cdn.test']}, NOW)
    expect(e.extraHosts).toEqual(['video.twimg.com', 'pay.example.net', 'cdn.test'])
    const exact = createEntry({url: 'example.com/a', matchMode: 'exact', extraHosts: ['example.com']}, NOW)
    expect(exact.extraHosts).toEqual(['example.com'])
  })
  it('throws invalid-host for an extra host that does not parse', () => {
    try {
      createEntry({url: 'example.com', extraHosts: ['ftp://x.test']}, NOW)
      expect.unreachable()
    } catch (error) {
      expect(isCoreError(error, 'invalid-host')).toBe(true)
    }
  })
  it('keeps a given title and exact mode', () => {
    const e = createEntry({url: 'https://example.org/x', title: ' T ', matchMode: 'exact'}, NOW)
    expect(e.title).toBe('T')
    expect(e.matchMode).toBe('exact')
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('throws invalid-url', () => {
    expect(() => createEntry({url: 'ftp://x'}, NOW)).toThrow()
    try {
      createEntry({url: ''}, NOW)
    } catch (error) {
      expect(isCoreError(error, 'invalid-url')).toBe(true)
    }
  })
})

describe('isUntitled', () => {
  it('is true for a blank title and for the domain or URL old entries defaulted to', () => {
    expect(isUntitled(createEntry({url: 'example.com', title: '  '}, NOW))).toBe(true)
    expect(isUntitled({url: 'https://www.example.com/', title: 'example.com'})).toBe(true)
    expect(isUntitled({url: 'https://example.com/a?b=1', title: 'https://example.com/a?b=1'})).toBe(true)
  })
  it('is false for a real title, even one that mentions the site', () => {
    expect(isUntitled({url: 'https://example.com/', title: 'Example'})).toBe(false)
    expect(isUntitled({url: 'https://example.com/', title: 'example.com docs'})).toBe(false)
  })
})

describe('parseExtraHosts', () => {
  it('splits on lines, spaces and commas, de-duplicates and reports what does not parse', () => {
    expect(parseExtraHosts('a.test\n\n b.test, c.test，a.test\nhttp://D.test:8080/p\nftp://x.test\nhttp://')).toEqual({
      hosts: ['a.test', 'b.test', 'c.test', 'd.test'],
      invalid: ['ftp://x.test', 'http://']
    })
    expect(parseExtraHosts(['x.test', 'www.y.test'])).toEqual({hosts: ['x.test', 'y.test'], invalid: []})
    expect(parseExtraHosts('   ')).toEqual({hosts: [], invalid: []})
  })
})

describe('editEntry', () => {
  it('keeps identity and usage stats', () => {
    const e = {...createEntry({url: 'example.com'}, NOW, 'id1'), openCount: 3, lastOpenedAt: NOW + 5}
    const edited = editEntry(e, {url: 'example.org', title: 'Org'})
    expect(edited).toMatchObject({id: 'id1', createdAt: NOW, openCount: 3, lastOpenedAt: NOW + 5, url: 'https://example.org/', title: 'Org', matchMode: 'site'})
  })
  it('keeps extra hosts unless the patch replaces them', () => {
    const e = createEntry({url: 'example.com', extraHosts: ['cdn.test']}, NOW)
    expect(editEntry(e, {url: 'example.com'}).extraHosts).toEqual(['cdn.test'])
    expect(editEntry(e, {url: 'example.com', extraHosts: []}).extraHosts).toEqual([])
  })
  it('keeps the icon on the same host and drops it for a new one', () => {
    const e = {...createEntry({url: 'example.com'}, NOW), icon: ICON}
    expect(editEntry(e, {url: 'https://example.com/other', title: 'T'}).icon).toBe(ICON)
    expect(editEntry(e, {url: 'example.com', matchMode: 'exact'}).icon).toBe(ICON)
    expect(editEntry(e, {url: 'example.org'})).not.toHaveProperty('icon')
    expect(editEntry(createEntry({url: 'example.com'}, NOW), {url: 'example.com'})).not.toHaveProperty('icon')
  })
})

describe('setEntryIcons', () => {
  it('sets valid icons by id and leaves everything else alone', () => {
    const a = createEntry({url: 'example.com'}, NOW, 'a')
    const b = createEntry({url: 'example.org'}, NOW, 'b')
    const data = addEntry(addEntry(emptyVaultData(), a), b)
    const out = setEntryIcons(data, new Map([['a', ICON], ['b', 'https://example.org/favicon.ico'], ['zz', ICON]]))
    expect(out.entries.map((e) => e.icon)).toEqual([undefined, ICON])
    expect(out.entries).toHaveLength(2)
    expect(data.entries.every((e) => e.icon === undefined)).toBe(true)
  })
})

describe('isEntryIcon', () => {
  it('accepts only bounded base64 image data URLs', () => {
    expect(isEntryIcon(ICON)).toBe(true)
    expect(isEntryIcon('data:image/webp;base64,AAAA')).toBe(true)
    expect(isEntryIcon('data:image/jpeg;base64,AAAA')).toBe(true)
    for (const bad of [
      undefined,
      42,
      '',
      'https://example.com/favicon.ico',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png,raw',
      'data:image/png;base64,AA AA',
      'data:text/html;base64,PGI+',
      `data:image/png;base64,${'A'.repeat(MAX_ENTRY_ICON_LENGTH)}`
    ]) {
      expect(isEntryIcon(bad), String(bad).slice(0, 40)).toBe(false)
    }
  })
})

describe('vault operations', () => {
  it('add / replace / record / remove', () => {
    let data = emptyVaultData()
    const a = createEntry({url: 'example.com'}, NOW, 'a')
    const b = createEntry({url: 'example.org'}, NOW, 'b')
    data = addEntry(addEntry(data, a), b)
    expect(data.entries.map((e) => e.id)).toEqual(['b', 'a'])
    data = recordOpen(data, 'a', NOW + 1)
    expect(data.entries[1]).toMatchObject({openCount: 1, lastOpenedAt: NOW + 1})
    data = replaceEntry(data, {...b, title: 'B'})
    expect(data.entries[0]?.title).toBe('B')
    data = removeEntry(data, 'b')
    expect(data.entries.map((e) => e.id)).toEqual(['a'])
    data = updateSettings(data, {skipSaveNotice: true})
    expect(data.settings.skipSaveNotice).toBe(true)
  })
  it('findDuplicate uses normalized identity per match mode', () => {
    const entries = [
      createEntry({url: 'https://www.example.com/a'}, NOW, 'site'),
      createEntry({url: 'https://example.org/p?q=1#x', matchMode: 'exact'}, NOW, 'exact')
    ]
    expect(findDuplicate(entries, {url: 'http://EXAMPLE.com/other', matchMode: 'site'})?.id).toBe('site')
    expect(findDuplicate(entries, {url: 'https://example.com/a', matchMode: 'exact'})).toBeUndefined()
    expect(findDuplicate(entries, {url: 'https://example.org/p?q=1', matchMode: 'exact'})?.id).toBe('exact')
    expect(findDuplicate(entries, {url: 'https://example.org/p/?q=1', matchMode: 'exact'})?.id).toBe('exact')
    expect(findDuplicate(entries, {url: 'https://example.com/', matchMode: 'site'}, 'site')).toBeUndefined()
  })
  it('searchEntries matches title and url; all terms must match', () => {
    const entries = [
      createEntry({url: 'example.com', title: 'Alpha work'}, NOW, '1'),
      createEntry({url: 'example.org', title: 'Beta reading'}, NOW, '2')
    ]
    expect(searchEntries(entries, '').map((e) => e.id)).toEqual(['1', '2'])
    expect(searchEntries(entries, 'ALPHA').map((e) => e.id)).toEqual(['1'])
    expect(searchEntries(entries, 'org').map((e) => e.id)).toEqual(['2'])
    expect(searchEntries(entries, 'reading beta').map((e) => e.id)).toEqual(['2'])
    expect(searchEntries(entries, 'work beta')).toEqual([])
  })
  it('searchEntries also matches extra hosts', () => {
    const entries = [createEntry({url: 'example.com', extraHosts: ['video.cdn.test']}, NOW, '1')]
    expect(searchEntries(entries, 'cdn').map((e) => e.id)).toEqual(['1'])
  })
})

describe('widensScope', () => {
  it('is true for a new entry, a new site / URL / mode, or an added extra host', () => {
    const e = createEntry({url: 'example.com', extraHosts: ['cdn.test']}, NOW, 'x')
    expect(widensScope(undefined, e)).toBe(true)
    expect(widensScope(e, editEntry(e, {url: 'example.org'}))).toBe(true)
    expect(widensScope(e, editEntry(e, {url: 'example.org/a', matchMode: 'exact'}))).toBe(true)
    expect(widensScope(e, editEntry(e, {url: 'example.com', extraHosts: ['cdn.test', 'pay.test']}))).toBe(true)
  })
  it('is true when an exact URL becomes a site, another URL, or a parent site', () => {
    const exact = createEntry({url: 'example.com/a', matchMode: 'exact'}, NOW, 'x')
    expect(widensScope(exact, editEntry(exact, {url: 'example.com/a', matchMode: 'site'}))).toBe(true)
    expect(widensScope(exact, editEntry(exact, {url: 'example.com/b'}))).toBe(true)
    const sub = createEntry({url: 'mail.example.com'}, NOW, 'y')
    expect(widensScope(sub, editEntry(sub, {url: 'example.com'}))).toBe(true)
  })
  it('is false when only the title changes or extra hosts are removed', () => {
    const e = createEntry({url: 'example.com', extraHosts: ['cdn.test']}, NOW, 'x')
    expect(widensScope(e, editEntry(e, {url: 'https://www.example.com/other', title: 'New'}))).toBe(false)
    expect(widensScope(e, editEntry(e, {url: 'example.com', extraHosts: []}))).toBe(false)
  })
  it('is false when the scope narrows to pages already protected', () => {
    const e = createEntry({url: 'example.com', extraHosts: ['cdn.test']}, NOW, 'x')
    expect(widensScope(e, editEntry(e, {url: 'example.com/a', matchMode: 'exact'}))).toBe(false)
    expect(widensScope(e, editEntry(e, {url: 'cdn.test/page', matchMode: 'exact', extraHosts: []}))).toBe(false)
    expect(widensScope(e, editEntry(e, {url: 'mail.example.com', extraHosts: ['img.cdn.test']}))).toBe(false)
    const exact = createEntry({url: 'https://example.com/a', matchMode: 'exact'}, NOW, 'y')
    expect(widensScope(exact, editEntry(exact, {url: 'https://example.com/a', title: 'New'}))).toBe(false)
  })
})

describe('entryCoversUrl', () => {
  it('site entries cover the host and subdomains on label boundaries', () => {
    const site = createEntry({url: 'www.example.com'}, NOW)
    expect(entryCoversUrl(site, 'https://a.example.com/x')).toBe(true)
    expect(entryCoversUrl(site, 'http://EXAMPLE.com:8080/')).toBe(true)
    expect(entryCoversUrl(site, 'https://evil-example.com/')).toBe(false)
    expect(entryCoversUrl(site, 'chrome://bookmarks')).toBe(false)
  })
  it('exact entries cover only the same normalized address', () => {
    const exact = createEntry({url: 'https://example.org/p?q=1', matchMode: 'exact'}, NOW)
    expect(entryCoversUrl(exact, 'http://www.example.org/p?q=1#h')).toBe(true)
    expect(entryCoversUrl(exact, 'https://example.org/p')).toBe(false)
    expect(entryCoversUrl(exact, 'https://example.org/p/?q=1')).toBe(true)
  })
  it('extra hosts cover themselves and their subdomains in either mode', () => {
    for (const matchMode of ['site', 'exact'] as const) {
      const e = createEntry({url: 'https://example.org/p', matchMode, extraHosts: ['twimg.com', 'pay.example.net']}, NOW)
      expect(entryCoversUrl(e, 'https://video.twimg.com/v.mp4')).toBe(true)
      expect(entryCoversUrl(e, 'http://www.pay.example.net/checkout?o=1')).toBe(true)
      expect(entryCoversUrl(e, 'https://example.net/')).toBe(false)
      expect(entryCoversUrl(e, 'https://evil-twimg.com/')).toBe(false)
      expect(entryCoversUrl(e, 'https://example.org/other')).toBe(matchMode === 'site')
    }
  })
})

describe('migrateVaultData', () => {
  it('accepts a valid payload and defaults unknown settings', () => {
    const data = {...emptyVaultData(), entries: [createEntry({url: 'example.com'}, NOW, 'x')]}
    expect(migrateVaultData(JSON.parse(JSON.stringify(data)))).toEqual(data)
    expect(migrateVaultData({version: 1, entries: [], settings: {extra: 1}}).settings).toEqual({})
    expect(migrateVaultData({version: 1, entries: []}).settings).toEqual({})
  })
  it('drops the retired open-mode setting from older payloads, flagging incognito once', () => {
    for (const openMode of ['current', 'newTab', 'incognito', 'teleport']) {
      for (const version of [1, 4]) {
        const out = migrateVaultData({version, entries: [], settings: {openMode, skipSaveNotice: true}})
        expect(out.settings).toEqual(
          openMode === 'incognito' ? {skipSaveNotice: true, incognitoRetired: true} : {skipSaveNotice: true}
        )
      }
    }
  })
  it('keeps the incognito-retired flag until it is cleared, and only when it is true', () => {
    const data = updateSettings(emptyVaultData(), {incognitoRetired: true, skipSaveCheck: true})
    expect(migrateVaultData(JSON.parse(JSON.stringify(data))).settings).toEqual({incognitoRetired: true, skipSaveCheck: true})
    const cleared = clearIncognitoRetired(data)
    expect(cleared.settings).toEqual({skipSaveCheck: true})
    expect(data.settings.incognitoRetired).toBe(true)
    expect(migrateVaultData(JSON.parse(JSON.stringify(cleared))).settings).toEqual({skipSaveCheck: true})
    for (const bad of [false, 'yes', 1]) {
      expect(migrateVaultData({version: 4, entries: [], settings: {incognitoRetired: bad}}).settings).toEqual({})
    }
    expect(emptyVaultData().settings).not.toHaveProperty('incognitoRetired')
  })
  it('upgrades v1 entries with empty extra hosts and drops note / tags; v2 entries must carry extra hosts', () => {
    const current = createEntry({url: 'example.com'}, NOW, 'x')
    const v1Entry: Record<string, unknown> = {...current, note: 'n', tags: ['t']}
    delete v1Entry.extraHosts
    expect(migrateVaultData({version: 1, entries: [v1Entry]})).toEqual({
      version: 4,
      entries: [current],
      settings: {}
    })
    expect(() => migrateVaultData({version: 1, entries: [{...v1Entry, tags: undefined}]})).toThrow()
    expect(() => migrateVaultData({version: 2, entries: [v1Entry]})).toThrow()
    expect(() => migrateVaultData({version: 2, entries: [{...v1Entry, extraHosts: [1]}]})).toThrow()
  })
  it('upgrades v2 entries by dropping note and tags', () => {
    const current = {...createEntry({url: 'example.com', extraHosts: ['cdn.test']}, NOW, 'x'), lastOpenedAt: NOW + 1}
    const v2Entry = {...current, note: 'n', tags: ['a', 'b']}
    const out = migrateVaultData({version: 2, entries: [v2Entry]})
    expect(out.version).toBe(4)
    expect(out.entries).toEqual([current])
    expect(out.entries[0]).not.toHaveProperty('note')
    expect(out.entries[0]).not.toHaveProperty('tags')
    expect(() => migrateVaultData({version: 2, entries: [{...current}]})).toThrow()
  })
  it('upgrades v3 entries without icons; v4 keeps valid icons and drops the rest', () => {
    const current = {...createEntry({url: 'example.com', extraHosts: ['cdn.test']}, NOW, 'x'), lastOpenedAt: NOW + 1}
    const v3 = migrateVaultData({version: 3, entries: [{...current, icon: ICON}]})
    expect(v3.version).toBe(4)
    expect(v3.entries).toEqual([current])
    const withIcon = {...current, icon: ICON}
    expect(migrateVaultData({version: 4, entries: [withIcon]}).entries).toEqual([withIcon])
    for (const icon of ['https://example.com/favicon.ico', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      expect(migrateVaultData({version: 4, entries: [{...current, icon}]}).entries).toEqual([current])
    }
    expect(() => migrateVaultData({version: 4, entries: [{...current, icon: 1}]})).toThrow()
    expect(() => migrateVaultData({version: 4, entries: [{...current, extraHosts: undefined}]})).toThrow()
  })
  it('keeps the optional save-notice flag only when it is a boolean', () => {
    const data = updateSettings(emptyVaultData(), {skipSaveNotice: true})
    expect(migrateVaultData(JSON.parse(JSON.stringify(data))).settings).toEqual({skipSaveNotice: true})
    expect(migrateVaultData({version: 1, entries: [], settings: {skipSaveNotice: 'yes'}}).settings).toEqual({})
    expect(emptyVaultData().settings).not.toHaveProperty('skipSaveNotice')
  })
  it('keeps the optional save-check flag only when it is a boolean', () => {
    const data = updateSettings(emptyVaultData(), {skipSaveCheck: true})
    expect(migrateVaultData(JSON.parse(JSON.stringify(data))).settings).toEqual({skipSaveCheck: true})
    expect(migrateVaultData({version: 4, entries: [], settings: {skipSaveCheck: 1}}).settings).toEqual({})
    expect(emptyVaultData().settings).not.toHaveProperty('skipSaveCheck')
  })
  it('rejects malformed payloads and unknown versions', () => {
    const cases: [unknown, string][] = [
      [null, 'invalid-data'],
      [{version: 1, entries: [{id: 1}]}, 'invalid-data'],
      [{version: 1, entries: 'x'}, 'invalid-data'],
      [{version: 99, entries: []}, 'unsupported-version']
    ]
    for (const [raw, code] of cases) {
      try {
        migrateVaultData(raw)
        expect.unreachable()
      } catch (error) {
        expect(isCoreError(error, code as never), JSON.stringify(raw)).toBe(true)
      }
    }
  })
})
