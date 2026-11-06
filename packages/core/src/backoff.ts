import {isFiniteNumber, isRecord} from './guards.ts'

/**
 * Silent throttling of failed unlock attempts. The UI never shows it: during
 * a back-off window an Enter in the filter box simply does nothing beyond
 * filtering.
 *
 * The first FREE_ATTEMPTS failures cost nothing (normal filter use presses
 * Enter too); after that the wait doubles from 1 s up to 60 s.
 */
export interface UnlockThrottle {
  failures: number
  /** Epoch ms before which no unlock attempt is made. */
  nextAllowedAt: number
}

export const FREE_ATTEMPTS = 3
export const BASE_DELAY_MS = 1_000
export const MAX_DELAY_MS = 60_000

export const INITIAL_THROTTLE: UnlockThrottle = {failures: 0, nextAllowedAt: 0}

export function delayAfterFailures(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS - 1))
}

export function canAttemptUnlock(state: UnlockThrottle, now: number): boolean {
  return now >= state.nextAllowedAt
}

export function recordUnlockFailure(state: UnlockThrottle, now: number): UnlockThrottle {
  const failures = state.failures + 1
  return {failures, nextAllowedAt: now + delayAfterFailures(failures)}
}

export function parseThrottle(raw: unknown): UnlockThrottle {
  if (isRecord(raw) && isFiniteNumber(raw.failures) && isFiniteNumber(raw.nextAllowedAt)) {
    return {failures: raw.failures, nextAllowedAt: raw.nextAllowedAt}
  }
  return {...INITIAL_THROTTLE}
}
