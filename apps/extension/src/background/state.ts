import {isFiniteNumber, isRecord} from '@nightstand/core'
import {STORAGE_KEYS} from '@/platform/storage'

/** Background bookkeeping in `storage.local` (`state`). Nothing here is secret. */
export interface BackgroundState {
  /** Epoch ms of the last completed history scan (0 = never). */
  lastScanAt: number
  /** Incognito / private windows Nightstand opened, closed again on panic. */
  incognitoWindows: number[]
}

function parse(raw: unknown): BackgroundState {
  if (!isRecord(raw)) return {lastScanAt: 0, incognitoWindows: []}
  return {
    lastScanAt: isFiniteNumber(raw.lastScanAt) ? raw.lastScanAt : 0,
    incognitoWindows: Array.isArray(raw.incognitoWindows) ? raw.incognitoWindows.filter(isFiniteNumber) : []
  }
}

// Serialize read-modify-write cycles so concurrent events don't clobber each other.
let queue: Promise<unknown> = Promise.resolve()

export function updateState(change: (state: BackgroundState) => BackgroundState): Promise<BackgroundState> {
  const run = queue.then(async () => {
    const result = await chrome.storage.local.get(STORAGE_KEYS.state)
    const next = change(parse(result[STORAGE_KEYS.state]))
    await chrome.storage.local.set({[STORAGE_KEYS.state]: next})
    return next
  })
  queue = run.catch(() => undefined)
  return run
}

export async function readState(): Promise<BackgroundState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.state)
  return parse(result[STORAGE_KEYS.state])
}
