import {describe, expect, it} from 'vitest'
import {
  addEntry,
  createEntry,
  editEntry,
  entryCoversUrl,
  emptyVaultData,
  findDuplicate,
  isCoreError,
  migrateVaultData,
  recordOpen,
  removeEntry,
  replaceEntry,
  searchEntries,
  updateSettings
} from '../src/index.ts'

const NOW = 1_700_000_000_000

describe('createEntry', () => {
  it('normalizes input and fills defaults', () => {
    const e = createEntry({url: ' example.com/foo ', tags: [' a ', 'a', '', 'b'], note: '  '}, NOW, 'id1')
    expect(e).toEqual({
      id: 'id1',
      url: 'https://example.com/foo',
      title: 'example.com',
      tags: ['a', 'b'],
      matchMode: 'site',
      createdAt: NOW,
      openCount: 0
    })
  })
  it('keeps a given title, note and exact mode', () => {
    const e = createEntry({url: 'https://example.org/x', title: ' T ', note: ' n ', matchMode: 'exact'}, NOW)
    expect(e.title).toBe('T')
    expect(e.note).toBe('n')
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

describe('editEntry', () => {
  it('keeps identity and usage stats', () => {
    const e = {...createEntry({url: 'example.com'}, NOW, 'id1'), openCount: 3, lastOpenedAt: NOW + 5}
    const edited = editEntry(e, {url: 'example.org', title: 'Org'})
    expect(edited).toMatchObject({id: 'id1', createdAt: NOW, openCount: 3, lastOpenedAt: NOW + 5, url: 'https://example.org/', title: 'Org', matchMode: 'site'})
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
    data = updateSettings(data, {openMode: 'incognito'})
    expect(data.settings.openMode).toBe('incognito')
  })
  it('findDuplicate uses normalized identity per match mode', () => {
    const entries = [
      createEntry({url: 'https://www.example.com/a'}, NOW, 'site'),
      createEntry({url: 'https://example.org/p?q=1#x', matchMode: 'exact'}, NOW, 'exact')
    ]
    expect(findDuplicate(entries, {url: 'http://EXAMPLE.com/other', matchMode: 'site'})?.id).toBe('site')
    expect(findDuplicate(entries, {url: 'https://example.com/a', matchMode: 'exact'})).toBeUndefined()
    expect(findDuplicate(entries, {url: 'https://example.org/p?q=1', matchMode: 'exact'})?.id).toBe('exact')
    expect(findDuplicate(entries, {url: 'https://example.com/', matchMode: 'site'}, 'site')).toBeUndefined()
  })
  it('searchEntries matches title, url, note and tags; all terms must match', () => {
    const entries = [
      createEntry({url: 'example.com', title: 'Alpha', tags: ['work']}, NOW, '1'),
      createEntry({url: 'example.org', title: 'Beta', note: 'Reading list'}, NOW, '2')
    ]
    expect(searchEntries(entries, '').map((e) => e.id)).toEqual(['1', '2'])
    expect(searchEntries(entries, 'ALPHA').map((e) => e.id)).toEqual(['1'])
    expect(searchEntries(entries, 'org').map((e) => e.id)).toEqual(['2'])
    expect(searchEntries(entries, 'reading beta').map((e) => e.id)).toEqual(['2'])
    expect(searchEntries(entries, 'work beta')).toEqual([])
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
  })
})

describe('migrateVaultData', () => {
  it('accepts a valid payload and defaults unknown settings', () => {
    const data = {...emptyVaultData(), entries: [createEntry({url: 'example.com'}, NOW, 'x')]}
    expect(migrateVaultData(JSON.parse(JSON.stringify(data)))).toEqual(data)
    expect(migrateVaultData({version: 1, entries: [], settings: {openMode: 'teleport', extra: 1}}).settings).toEqual({openMode: 'newTab'})
    expect(migrateVaultData({version: 1, entries: []}).settings.openMode).toBe('newTab')
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
