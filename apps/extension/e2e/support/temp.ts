import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const created: string[] = []

/** A fresh directory under the OS temp dir, removed again by `cleanupTemp()`. */
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `nightstand-e2e-${prefix}-`))
  created.push(dir)
  return dir
}

/** Removes only the directories `tempDir()` created in this process. */
export function cleanupTemp(): void {
  for (const dir of created.splice(0)) rmSync(dir, {recursive: true, force: true})
}

/**
 * A throwaway copy of a build whose manifest (and optionally background
 * script) is patched for a test — e.g. `bookmarks` pre-granted, because
 * automation can't accept a permission prompt.
 */
export function patchedCopy(
  dist: string,
  patch: {
    manifest?: (manifest: Record<string, unknown>) => void
    backgroundFile?: string
    appendToBackground?: string
  }
): string {
  const dir = tempDir('ext')
  cpSync(dist, dir, {recursive: true})
  if (patch.manifest) {
    const file = join(dir, 'manifest.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    patch.manifest(manifest)
    writeFileSync(file, JSON.stringify(manifest))
  }
  if (patch.backgroundFile && patch.appendToBackground) {
    const file = join(dir, patch.backgroundFile)
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n;${patch.appendToBackground}\n`)
  }
  return dir
}

/** Manifest patch: turn the optional `bookmarks` permission into a granted one. */
export function grantBookmarks(manifest: Record<string, unknown>): void {
  ;(manifest.permissions as string[]).push('bookmarks')
  delete manifest.optional_permissions
}
