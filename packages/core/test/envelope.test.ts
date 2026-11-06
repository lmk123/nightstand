import {describe, expect, it} from 'vitest'
import {
  DEFAULT_ITERATIONS,
  changePassphrase,
  createEntry,
  createVault,
  emptyVaultData,
  isCoreError,
  openVault,
  rotateRecoveryCode,
  sealVault,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  addEntry,
  type VaultData
} from '../src/index.ts'

const FAST = {iterations: 1_000}

function sampleData(): VaultData {
  return addEntry(emptyVaultData(), createEntry({url: 'example.com', note: '中文备注'}, 1, 'e1'))
}

describe('envelope encryption', () => {
  it('round-trips with the passphrase and with the recovery code', async () => {
    const data = sampleData()
    const {stored, recoveryCode} = await createVault('lantern', data, FAST)
    const viaPass = await unlockWithPassphrase(stored, 'lantern')
    const viaRecovery = await unlockWithRecoveryCode(stored, recoveryCode)
    expect(viaPass).not.toBeNull()
    expect(viaRecovery).not.toBeNull()
    expect(await openVault(stored, viaPass!)).toEqual(data)
    expect(await openVault(stored, viaRecovery!)).toEqual(data)
  })

  it('stores no plaintext', async () => {
    const {stored, recoveryCode} = await createVault('lantern', sampleData(), FAST)
    const json = JSON.stringify(stored)
    for (const secret of ['example', 'lantern', recoveryCode, recoveryCode.replace(/-/g, '')]) {
      expect(json).not.toContain(secret)
    }
  })

  it('uses the default iteration count and distinct salts and IVs', async () => {
    const {stored} = await createVault('lantern', emptyVaultData())
    expect(stored.kdf.pass.iterations).toBe(DEFAULT_ITERATIONS)
    expect(stored.kdf.pass.iterations).toBeGreaterThanOrEqual(600_000)
    expect(stored.kdf.pass.salt).not.toBe(stored.kdf.recovery.salt)
    const ivs = new Set([stored.wrapped.pass.iv, stored.wrapped.recovery.iv, stored.payload.iv])
    expect(ivs.size).toBe(3)
  })

  it('tolerates surrounding whitespace and recovery-code formatting', async () => {
    const {stored, recoveryCode} = await createVault('lantern', emptyVaultData(), FAST)
    expect(await unlockWithPassphrase(stored, '  lantern ')).not.toBeNull()
    expect(await unlockWithRecoveryCode(stored, recoveryCode.toLowerCase().replace(/-/g, ' '))).not.toBeNull()
  })

  it('returns null (never throws) for wrong secrets', async () => {
    const {stored, recoveryCode} = await createVault('lantern', emptyVaultData(), FAST)
    expect(await unlockWithPassphrase(stored, 'Lantern')).toBeNull()
    expect(await unlockWithPassphrase(stored, '')).toBeNull()
    expect(await unlockWithRecoveryCode(stored, 'lantern')).toBeNull()
    expect(await unlockWithPassphrase(stored, recoveryCode)).toBeNull()
    const other = await createVault('lantern', emptyVaultData(), FAST)
    expect(await unlockWithRecoveryCode(stored, other.recoveryCode)).toBeNull()
  })

  it('cannot swap the recovery wrap in for the passphrase wrap', async () => {
    const {stored, recoveryCode} = await createVault('lantern', emptyVaultData(), FAST)
    const swapped = {...stored, kdf: {...stored.kdf, pass: stored.kdf.recovery}, wrapped: {...stored.wrapped, pass: stored.wrapped.recovery}}
    expect(await unlockWithPassphrase(swapped, recoveryCode.replace(/-/g, ''))).toBeNull()
  })

  it('detects a tampered payload', async () => {
    const {stored, dek} = await createVault('lantern', sampleData(), FAST)
    const ct = stored.payload.ct
    const tampered = {...stored, payload: {...stored.payload, ct: (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1)}}
    await expect(openVault(tampered, dek)).rejects.toSatisfy((e) => isCoreError(e, 'decrypt-failed'))
  })

  it('sealVault re-encrypts with a fresh IV and keeps the key wraps', async () => {
    const {stored, dek} = await createVault('lantern', emptyVaultData(), FAST)
    const data = sampleData()
    const resealed = await sealVault(stored, dek, data)
    expect(resealed.payload.iv).not.toBe(stored.payload.iv)
    expect(resealed.wrapped).toEqual(stored.wrapped)
    const again = await unlockWithPassphrase(resealed, 'lantern')
    expect(await openVault(resealed, again!)).toEqual(data)
  })

  it('changePassphrase: new works, old fails, recovery still works', async () => {
    const data = sampleData()
    const {stored, dek, recoveryCode} = await createVault('lantern', data, FAST)
    const changed = await changePassphrase(stored, dek, 'harbor')
    expect(changed.kdf.pass.iterations).toBe(FAST.iterations)
    expect(changed.kdf.pass.salt).not.toBe(stored.kdf.pass.salt)
    expect(await unlockWithPassphrase(changed, 'lantern')).toBeNull()
    const viaNew = await unlockWithPassphrase(changed, 'harbor')
    expect(await openVault(changed, viaNew!)).toEqual(data)
    expect(await unlockWithRecoveryCode(changed, recoveryCode)).not.toBeNull()
  })

  it('rotateRecoveryCode: new code works, old one fails, passphrase unaffected', async () => {
    const {stored, dek, recoveryCode} = await createVault('lantern', emptyVaultData(), FAST)
    const rotated = await rotateRecoveryCode(stored, dek)
    expect(rotated.recoveryCode).not.toBe(recoveryCode)
    expect(await unlockWithRecoveryCode(rotated.stored, recoveryCode)).toBeNull()
    expect(await unlockWithRecoveryCode(rotated.stored, rotated.recoveryCode)).not.toBeNull()
    expect(await unlockWithPassphrase(rotated.stored, 'lantern')).not.toBeNull()
  })

  it('reset via recovery code = unlock with code, then set a new passphrase', async () => {
    const data = sampleData()
    const {stored, recoveryCode} = await createVault('forgotten', data, FAST)
    const dek = await unlockWithRecoveryCode(stored, recoveryCode)
    const reset = await changePassphrase(stored, dek!, 'fresh-start')
    const viaNew = await unlockWithPassphrase(reset, 'fresh-start')
    expect(await openVault(reset, viaNew!)).toEqual(data)
    expect(await unlockWithPassphrase(reset, 'forgotten')).toBeNull()
  })
})
