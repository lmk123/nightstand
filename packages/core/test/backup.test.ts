import {describe, expect, it} from 'vitest'
import {
  createBackup,
  createEntry,
  createVault,
  emptyVaultData,
  isCoreError,
  mergeEntries,
  openBackup,
  parseBackup,
  serializeBackup,
  toPlaintextExport,
  addEntry,
  type VaultEntry
} from '../src/index.ts'

const FAST = {iterations: 1_000}

describe('backup files', () => {
  it('round-trip and open with the passphrase or the recovery code', async () => {
    const data = addEntry(emptyVaultData(), createEntry({url: 'example.com'}, 1, 'e1'))
    const {stored, recoveryCode} = await createVault('lantern', data, FAST)
    const text = serializeBackup(createBackup(stored, 42))
    expect(text).not.toContain('example')
    const parsed = parseBackup(text)
    expect(parsed.createdAt).toBe(42)
    expect(await openBackup(parsed, 'lantern')).toEqual(data)
    expect(await openBackup(parsed, recoveryCode)).toEqual(data)
    expect(await openBackup(parsed, 'wrong')).toBeNull()
  })

  it('rejects files that are not Nightstand backups', () => {
    const cases: [string, string][] = [
      ['not json', 'backup-invalid'],
      ['{}', 'backup-invalid'],
      ['[]', 'backup-invalid'],
      [JSON.stringify({format: 'other', version: 1}), 'backup-invalid'],
      [JSON.stringify({format: 'nightstand-backup', version: 1, createdAt: 1, vault: {}}), 'backup-invalid'],
      [JSON.stringify({format: 'nightstand-backup', version: 1, createdAt: 'x', vault: {}}), 'backup-invalid'],
      [JSON.stringify({format: 'nightstand-backup', version: 2}), 'unsupported-version'],
      [JSON.stringify({format: 'nightstand-backup', version: 1, createdAt: 1, vault: {version: 9}}), 'unsupported-version']
    ]
    for (const [text, code] of cases) {
      try {
        parseBackup(text)
        expect.unreachable(text)
      } catch (error) {
        expect(isCoreError(error, code as never), text).toBe(true)
      }
    }
  })
})

describe('mergeEntries', () => {
  const base = (id: string, url: string, extra: Partial<VaultEntry> = {}): VaultEntry => ({
    ...createEntry({url}, 100, id),
    ...extra
  })

  it('adds new entries, keeps current ones, de-duplicates by normalized identity', () => {
    const current = [base('a', 'https://example.com/')]
    const incoming = [base('x', 'https://www.EXAMPLE.com/other'), base('y', 'https://example.org/')]
    const result = mergeEntries(current, incoming)
    expect(result.entries.map((e) => e.id)).toEqual(['a', 'y'])
    expect(result).toMatchObject({added: 1, updated: 0, unchanged: 1})
    expect(result.changed.map((e) => e.id)).toEqual(['y'])
  })

  it('reports added and updated entries (not unchanged ones) as changed, in list order', () => {
    const current = [base('a', 'https://example.com/'), base('b', 'https://example.net/', {lastOpenedAt: 900})]
    const incoming = [
      base('y', 'https://example.org/'),
      base('x', 'https://example.com/', {title: 'New', lastOpenedAt: 500}),
      base('z', 'https://example.net/', {lastOpenedAt: 200})
    ]
    const result = mergeEntries(current, incoming)
    expect(result.changed.map((e) => [e.id, e.title])).toEqual([
      ['a', 'New'],
      ['y', '']
    ])
  })

  it('the more recent duplicate wins but keeps the current id and max open count', () => {
    const current = [base('a', 'https://example.com/', {title: 'Old', openCount: 5})]
    const incoming = [base('x', 'https://example.com/', {title: 'New', lastOpenedAt: 500, openCount: 1})]
    const result = mergeEntries(current, incoming)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({id: 'a', title: 'New', openCount: 5, lastOpenedAt: 500})
    expect(result.updated).toBe(1)
  })

  it('a newer duplicate without an icon keeps the current icon', () => {
    const icon = 'data:image/png;base64,iVBORw0KGgo='
    const current = [base('a', 'https://example.com/', {icon})]
    const incoming = [base('x', 'https://example.com/', {title: 'New', lastOpenedAt: 500})]
    expect(mergeEntries(current, incoming).entries[0]).toMatchObject({title: 'New', icon})
    const newer = 'data:image/png;base64,AAAA'
    const replaced = mergeEntries(current, [base('x', 'https://example.com/', {lastOpenedAt: 500, icon: newer})])
    expect(replaced.entries[0]?.icon).toBe(newer)
  })

  it('a newer duplicate keeps the current extra hosts too', () => {
    const current = [base('a', 'https://example.com/', {extraHosts: ['cdn.example.net']})]
    const incoming = [base('x', 'https://example.com/', {lastOpenedAt: 500, extraHosts: ['pay.example.org']})]
    const result = mergeEntries(current, incoming)
    expect(result.entries[0]?.extraHosts).toEqual(['cdn.example.net', 'pay.example.org'])
    expect(result.updated).toBe(1)
  })

  it('an older duplicate still adds its extra hosts, and counts as updated', () => {
    const current = [base('a', 'https://example.com/', {title: 'Mine', lastOpenedAt: 900, extraHosts: ['cdn.example.net']})]
    const incoming = [base('x', 'https://example.com/', {title: 'Old', extraHosts: ['pay.example.org', 'cdn.example.net']})]
    const result = mergeEntries(current, incoming)
    expect(result.entries[0]).toMatchObject({id: 'a', title: 'Mine', extraHosts: ['cdn.example.net', 'pay.example.org']})
    expect(result).toMatchObject({added: 0, updated: 1, unchanged: 0})
    expect(result.changed.map((e) => e.id)).toEqual(['a'])
  })

  it('an older duplicate with no new extra hosts is unchanged', () => {
    const current = [base('a', 'https://example.com/', {lastOpenedAt: 900, extraHosts: ['cdn.example.net']})]
    const incoming = [base('x', 'https://example.com/', {extraHosts: ['cdn.example.net']})]
    expect(mergeEntries(current, incoming)).toMatchObject({updated: 0, unchanged: 1, changed: []})
  })

  it('site and exact entries for the same host are different entries', () => {
    const current = [base('a', 'https://example.com/')]
    const incoming = [{...base('b', 'https://example.com/'), matchMode: 'exact' as const}]
    expect(mergeEntries(current, incoming).added).toBe(1)
  })

  it('re-ids an incoming entry whose id collides with a different current entry', () => {
    const current = [base('same', 'https://example.com/')]
    const incoming = [base('same', 'https://example.org/')]
    const result = mergeEntries(current, incoming)
    expect(result.entries).toHaveLength(2)
    expect(new Set(result.entries.map((e) => e.id)).size).toBe(2)
  })

  it('de-duplicates within the incoming list too', () => {
    const result = mergeEntries([], [base('1', 'https://example.com/'), base('2', 'https://www.example.com/')])
    expect(result.entries).toHaveLength(1)
  })
})

describe('plaintext export', () => {
  it('contains the entries and a format marker', () => {
    const data = addEntry(emptyVaultData(), createEntry({url: 'example.com'}, 1, 'e1'))
    const parsed = JSON.parse(toPlaintextExport(data, 7))
    expect(parsed).toMatchObject({format: 'nightstand-plaintext', version: 1, exportedAt: 7})
    expect(parsed.entries[0].url).toBe('https://example.com/')
  })
  it('leaves icons out', () => {
    const entry = {...createEntry({url: 'example.com'}, 1, 'e1'), icon: 'data:image/png;base64,iVBORw0KGgo='}
    const parsed = JSON.parse(toPlaintextExport(addEntry(emptyVaultData(), entry), 7))
    expect(parsed.entries[0]).not.toHaveProperty('icon')
    expect(parsed.entries[0].id).toBe('e1')
  })
})
