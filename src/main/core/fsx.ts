import { constants } from 'node:fs'
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { RayError } from '@shared/errors'
import { assertPathLength } from './paths'

export async function ensureDir(dir: string): Promise<void> {
  assertPathLength(dir)
  await mkdir(dir, { recursive: true })
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function fileSize(target: string): Promise<number | null> {
  try {
    const info = await stat(target)
    return info.isFile() ? info.size : null
  } catch {
    return null
  }
}

export async function writeFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  assertPathLength(target)
  await ensureDir(path.dirname(target))
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  await writeFile(temporary, data)
  try {
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw wrapFsError(error, target)
  }
}

export async function readJson<T>(target: string): Promise<T | null> {
  try {
    const raw = await readFile(target, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if (isNotFound(error)) return null
    throw wrapFsError(error, target)
  }
}

export async function writeJson(target: string, value: unknown): Promise<void> {
  await writeFileAtomic(target, `${JSON.stringify(value, null, 2)}\n`)
}

export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
}

export async function withFileLockRetry<T>(
  operation: () => Promise<T>,
  attempts = 4,
  delayMs = 250
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isLocked(error) || attempt === attempts) break
      await sleep(delayMs * attempt)
    }
  }
  throw RayError.from(lastError, isLocked(lastError) ? 'FILE_LOCKED' : 'INTERNAL')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null
    ? (error as { code?: string }).code
    : undefined
}

export function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

export function isLocked(error: unknown): boolean {
  const code = errorCode(error)
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
}

export function isDiskFull(error: unknown): boolean {
  return errorCode(error) === 'ENOSPC'
}

export function wrapFsError(error: unknown, target: string): RayError {
  if (isDiskFull(error)) {
    return new RayError('DISK_FULL', `Не хватает места на диске: ${target}`, { path: target })
  }
  if (isLocked(error)) {
    return new RayError('FILE_LOCKED', `Файл занят другим процессом: ${target}`, { path: target })
  }
  return RayError.from(error)
}
