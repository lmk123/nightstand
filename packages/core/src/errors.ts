/**
 * Machine-readable error codes. Core never produces user-facing text; the UI
 * maps these codes to localized messages.
 */
export type CoreErrorCode =
  | 'invalid-url'
  | 'invalid-data'
  | 'unsupported-version'
  | 'decrypt-failed'
  | 'backup-invalid'

export class CoreError extends Error {
  readonly code: CoreErrorCode

  constructor(code: CoreErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.name = 'CoreError'
    this.code = code
  }
}

export function isCoreError(error: unknown, code?: CoreErrorCode): error is CoreError {
  return error instanceof CoreError && (code === undefined || error.code === code)
}
