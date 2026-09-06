import { WorkerPool } from './workerPool'
import { ensureDir, withFileLockRetry } from './fsx'

interface UnzipTask {
  archive: string
  target: string
  exclude: string[]
}

const pool = new WorkerPool<UnzipTask, string[]>('unzip.worker.js')

export async function extractArchive(
  archive: string,
  target: string,
  exclude: string[] = []
): Promise<string[]> {
  await ensureDir(target)
  return withFileLockRetry(() => pool.run({ archive, target, exclude }))
}

export function disposeZipPool(): Promise<void> {
  return pool.dispose()
}
