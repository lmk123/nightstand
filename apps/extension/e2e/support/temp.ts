import {cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
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
 * script) is patched for a test. `onlyLocale` keeps that one catalog and makes
 * it the default, so the UI language no longer depends on the browser's.
 */
export function patchedCopy(
  dist: string,
  patch: {
    manifest?: (manifest: Record<string, unknown>) => void
    backgroundFile?: string
    appendToBackground?: string
    onlyLocale?: string
    /**
     * Text replaced in the page script, each `[from, to, times]`: it must
     * occur exactly `times` times, so a change in the built code fails loudly
     * instead of leaving the copy unpatched.
     */
    pageScript?: [from: string, to: string, times: number][]
  }
): string {
  const dir = tempDir('ext')
  cpSync(dist, dir, {recursive: true})
  const {onlyLocale} = patch
  if (onlyLocale) {
    const locales = join(dir, '_locales')
    for (const locale of readdirSync(locales)) {
      if (locale !== onlyLocale) rmSync(join(locales, locale), {recursive: true})
    }
  }
  if (patch.manifest || onlyLocale) {
    const file = join(dir, 'manifest.json')
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    if (onlyLocale) manifest.default_locale = onlyLocale
    patch.manifest?.(manifest)
    writeFileSync(file, JSON.stringify(manifest))
  }
  if (patch.backgroundFile && patch.appendToBackground) {
    const file = join(dir, patch.backgroundFile)
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n;${patch.appendToBackground}\n`)
  }
  if (patch.pageScript) {
    const file = join(dir, 'content_scripts', 'content-0.js')
    let code = readFileSync(file, 'utf8')
    for (const [from, to, times] of patch.pageScript) {
      const found = code.split(from).length - 1
      if (found !== times) throw new Error(`page script: expected ${from} ${times} times, found ${found}`)
      code = code.replaceAll(from, to)
    }
    writeFileSync(file, code)
  }
  return dir
}
