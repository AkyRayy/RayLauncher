import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { parentPort } from 'node:worker_threads'

interface HashTask {
  file: string
  algorithm: 'sha1' | 'sha512'
}

parentPort?.on('message', ({ id, task }: { id: number; task: HashTask }) => {
  const hash = createHash(task.algorithm)
  const stream = createReadStream(task.file)

  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('error', (error: NodeJS.ErrnoException) => {
    parentPort?.postMessage({
      id,
      error: { message: `${error.code ?? 'ERR'}: ${task.file}`, code: mapCode(error.code) }
    })
  })
  stream.on('end', () => {
    parentPort?.postMessage({ id, result: hash.digest('hex') })
  })
})

function mapCode(code?: string): string | undefined {
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' ? 'FILE_LOCKED' : undefined
}
