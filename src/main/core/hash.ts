import { WorkerPool } from './workerPool'
import { fileSize } from './fsx'

interface HashTask {
  file: string
  algorithm: 'sha1' | 'sha512'
}

const pool = new WorkerPool<HashTask, string>('hash.worker.js')

export function sha1File(file: string): Promise<string> {
  return pool.run({ file, algorithm: 'sha1' })
}

export function sha512File(file: string): Promise<string> {
  return pool.run({ file, algorithm: 'sha512' })
}

export async function verifyFile(
  file: string,
  expected: { sha1?: string; size?: number }
): Promise<boolean> {
  const actualSize = await fileSize(file)
  if (actualSize === null) return false
  if (expected.size !== undefined && expected.size > 0 && actualSize !== expected.size) return false
  if (!expected.sha1) return true

  const digest = await sha1File(file)
  return digest.toLowerCase() === expected.sha1.toLowerCase()
}

export function disposeHashPool(): Promise<void> {
  return pool.dispose()
}
