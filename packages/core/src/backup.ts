import {CoreError} from './errors.ts'
import {isFiniteNumber, isRecord} from './guards.ts'
import {entryKey, type VaultData, type VaultEntry} from './model.ts'
import {migrateStoredVault, type StoredVault} from './storage-format.ts'
import {openVault, unlockWithPassphrase, unlockWithRecoveryCode} from './crypto/envelope.ts'
import {looksLikeRecoveryCode} from './crypto/recovery-code.ts'

/**
 * `.nightstand` backup files: JSON holding only ciphertext and metadata (the
 * stored vault as is), so a backup opens with the passphrase or the recovery
 * code that were current when it was exported.
 */
export const BACKUP_FORMAT = 'nightstand-backup'
export const BACKUP_VERSION = 1
export const BACKUP_EXTENSION = '.nightstand'

export interface BackupFileV1 {
  format: typeof BACKUP_FORMAT
  version: 1
  createdAt: number
  vault: StoredVault
}

export type BackupFile = BackupFileV1

export function createBackup(stored: StoredVault, now: number): BackupFile {
  return {format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: now, vault: stored}
}

export function serializeBackup(backup: BackupFile): string {
  return `${JSON.stringify(backup, null, 2)}\n`
}

/** Parses and upgrades a backup file. Throws `backup-invalid` or `unsupported-version`. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new CoreError('backup-invalid', 'not JSON')
  }
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT) {
    throw new CoreError('backup-invalid', 'not a Nightstand backup')
  }
  switch (raw.version) {
    case 1: {
      if (!isFiniteNumber(raw.createdAt)) throw new CoreError('backup-invalid', 'bad createdAt')
      let vault: StoredVault
      try {
        vault = migrateStoredVault(raw.vault)
      } catch (error) {
        if (error instanceof CoreError && error.code === 'unsupported-version') throw error
        throw new CoreError('backup-invalid', 'bad vault')
      }
      return {format: BACKUP_FORMAT, version: 1, createdAt: raw.createdAt, vault}
    }
    default:
      throw new CoreError('unsupported-version', `backup version ${String(raw.version)}`)
  }
}

/**
 * Decrypts a backup with a passphrase or a recovery code. Returns null when
 * the secret is wrong; throws for a damaged file.
 */
export async function openBackup(backup: BackupFile, secret: string): Promise<VaultData | null> {
  const tryRecoveryFirst = looksLikeRecoveryCode(secret)
  let dek = tryRecoveryFirst ? await unlockWithRecoveryCode(backup.vault, secret) : null
  dek ??= await unlockWithPassphrase(backup.vault, secret)
  if (!dek) return null
  return openVault(backup.vault, dek)
}

export interface MergeResult {
  entries: VaultEntry[]
  added: number
  updated: number
  unchanged: number
  /** The added and updated entries, as they are in `entries`: what the import newly protects. */
  changed: VaultEntry[]
}

function recency(entry: VaultEntry): number {
  return Math.max(entry.createdAt, entry.lastOpenedAt ?? 0)
}

/**
 * Merges imported entries into the current ones. Duplicates are matched by
 * `entryKey` (match mode + normalized host or URL); the more recent of the
 * two wins, keeping the current entry's id and the higher open count.
 * Imported entries that are new are appended in their original order.
 */
export function mergeEntries(
  current: readonly VaultEntry[],
  incoming: readonly VaultEntry[]
): MergeResult {
  const entries = [...current]
  const indexByKey = new Map<string, number>()
  entries.forEach((entry, i) => {
    const key = entryKey(entry)
    if (key && !indexByKey.has(key)) indexByKey.set(key, i)
  })
  const usedIds = new Set(entries.map((e) => e.id))
  let added = 0
  let updated = 0
  let unchanged = 0
  const changedAt = new Set<number>()
  for (const entry of incoming) {
    const key = entryKey(entry)
    const existingIndex = key ? indexByKey.get(key) : undefined
    if (existingIndex === undefined) {
      const id = usedIds.has(entry.id) ? crypto.randomUUID() : entry.id
      usedIds.add(id)
      entries.push({...entry, id})
      if (key) indexByKey.set(key, entries.length - 1)
      changedAt.add(entries.length - 1)
      added++
      continue
    }
    const existing = entries[existingIndex]!
    if (recency(entry) > recency(existing)) {
      entries[existingIndex] = {
        ...entry,
        id: existing.id,
        openCount: Math.max(existing.openCount, entry.openCount)
      }
      // Same host, so the icon still fits; a newer entry without one (saved
      // where no icon was cached) shouldn't wipe it.
      const icon = entry.icon ?? existing.icon
      if (icon !== undefined) entries[existingIndex].icon = icon
      changedAt.add(existingIndex)
      updated++
    } else {
      unchanged++
    }
  }
  const changed = [...changedAt].sort((a, b) => a - b).map((i) => entries[i]!)
  return {entries, added, updated, unchanged, changed}
}

/**
 * Unencrypted export. The UI must show a prominent warning before offering
 * this. Icons are left out: they are kilobytes of base64 per entry that a
 * person reading the file has no use for.
 */
export function toPlaintextExport(data: VaultData, now: number): string {
  const entries = data.entries.map((entry) => {
    const copy = {...entry}
    delete copy.icon
    return copy
  })
  return `${JSON.stringify(
    {format: 'nightstand-plaintext', version: 1, exportedAt: now, entries},
    null,
    2
  )}\n`
}
