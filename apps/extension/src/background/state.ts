import {isFiniteNumber, isRecord} from '@nightstand/core'
import {serialQueue} from '@/lib/concurrency'
import {STORAGE_KEYS} from '@/platform/storage'

/** Background bookkeeping in `storage.local` (`state`). Nothing here is secret. */
export interface BackgroundState {
  /** Epoch ms of the last completed history scan (0 = never). */
  lastScanAt: number
}

function parse(raw: unknown): BackgroundState {
  // Only known fields are kept, so an old build's `incognitoWindows` list is
  // dropped on the next write.
  return {lastScanAt: isRecord(raw) && isFiniteNumber(raw.lastScanAt) ? raw.lastScanAt : 0}
}

// Serialize read-modify-write cycles so concurrent events don't clobber each other.
const serial = serialQueue()

export function updateState(change: (state: BackgroundState) => BackgroundState): Promise<BackgroundState> {
  return serial(async () => {
    const result = await chrome.storage.local.get(STORAGE_KEYS.state)
    const next = change(parse(result[STORAGE_KEYS.state]))
    await chrome.storage.local.set({[STORAGE_KEYS.state]: next})
    return next
  })
}

export async function readState(): Promise<BackgroundState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.state)
  return parse(result[STORAGE_KEYS.state])
}
