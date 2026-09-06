export const ERROR_CODES = [
  'NET_OFFLINE',
  'NET_TIMEOUT',
  'RATE_LIMIT',
  'HTTP_ERROR',
  'MS_NO_XBOX',
  'MS_NO_PROFILE',
  'MS_REGION',
  'MS_MINOR',
  'MS_NO_LICENSE',
  'MS_CANCELLED',
  'DISK_FULL',
  'JAVA_MISSING',
  'JAVA_VERSION_MISMATCH',
  'SHA1_MISMATCH',
  'FILE_LOCKED',
  'PATH_TOO_LONG',
  'LOADER_NO_VERSION',
  'MOD_INCOMPATIBLE',
  'MOD_DEPENDENCY_CYCLE',
  'GAME_CRASHED',
  'GAME_ALREADY_RUNNING',
  'PROFILE_NOT_FOUND',
  'ACCOUNT_NOT_FOUND',
  'VERSION_NOT_FOUND',
  'CURSEFORGE_NO_KEY',
  'INVALID_INPUT',
  'INTERNAL'
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface SerializedRayError {
  __ray: true
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
}

export class RayError extends Error {
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'RayError'
    this.code = code
    this.details = details
  }

  toJSON(): SerializedRayError {
    return this.details
      ? { __ray: true, code: this.code, message: this.message, details: this.details }
      : { __ray: true, code: this.code, message: this.message }
  }

  static from(error: unknown, fallback: ErrorCode = 'INTERNAL'): RayError {
    if (error instanceof RayError) return error
    if (isSerializedRayError(error)) return new RayError(error.code, error.message, error.details)
    if (error instanceof Error) return new RayError(fallback, error.message)
    return new RayError(fallback, String(error))
  }
}

export function isSerializedRayError(value: unknown): value is SerializedRayError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __ray?: unknown }).__ray === true &&
    typeof (value as { code?: unknown }).code === 'string'
  )
}

export const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'NET_OFFLINE',
  'NET_TIMEOUT',
  'RATE_LIMIT',
  'HTTP_ERROR',
  'FILE_LOCKED'
])
