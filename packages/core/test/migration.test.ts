import {describe, expect, it} from 'vitest'
import {
  migrateStoredVault,
  openBackup,
  openVault,
  parseBackup,
  unlockWithPassphrase,
  unlockWithRecoveryCode
} from '../src/index.ts'
import fixture from './fixtures/v1.json' with {type: 'json'}

// The v1 payload as the current build reads it: v2 gave every entry
// `extraHosts`, v3 dropped `note` and `tags`, v4 added an optional `icon`
// (absent here).
const expected = {
  ...fixture.expected,
  version: 4,
  entries: fixture.expected.entries.map((e) => {
    const out: Record<string, unknown> = {...e, extraHosts: []}
    delete out.note
    delete out.tags
    return out
  })
}

// `fixture` is a v1 vault frozen at the time v1 shipped. Every future build
// must still open it — this is what protects users from "updated and lost my
// data". Never regenerate it.

describe('stored vault v1 fixture', () => {
  it('migrates and opens with the passphrase', async () => {
    const stored = migrateStoredVault(fixture.vault)
    const dek = await unlockWithPassphrase(stored, fixture.passphrase)
    expect(dek).not.toBeNull()
    expect(await openVault(stored, dek!)).toEqual(expected)
  })

  it('opens with the recovery code', async () => {
    const stored = migrateStoredVault(fixture.vault)
    const dek = await unlockWithRecoveryCode(stored, fixture.recoveryCode)
    expect(await openVault(stored, dek!)).toEqual(expected)
  })

  it('the v1 backup file still parses and opens', async () => {
    const backup = parseBackup(JSON.stringify(fixture.backup))
    expect(await openBackup(backup, fixture.passphrase)).toEqual(expected)
    expect(await openBackup(backup, fixture.recoveryCode)).toEqual(expected)
  })

  it('rejects a malformed v1 vault', () => {
    expect(() => migrateStoredVault({...fixture.vault, payload: null})).toThrow()
    expect(() => migrateStoredVault({...fixture.vault, kdf: {pass: {algorithm: 'scrypt'}}})).toThrow()
  })
})
