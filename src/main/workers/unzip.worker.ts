import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { parentPort } from 'node:worker_threads'
import yauzl from 'yauzl'

interface UnzipTask {
  archive: string
  target: string
  exclude: string[]
}

parentPort?.on('message', ({ id, task }: { id: number; task: UnzipTask }) => {
  void extract(task)
    .then((files) => parentPort?.postMessage({ id, result: files }))
    .catch((error: NodeJS.ErrnoException) =>
      parentPort?.postMessage({
        id,
        error: { message: `${error.message} (${task.archive})`, code: mapCode(error.code) }
      })
    )
})

function extract(task: UnzipTask): Promise<string[]> {
  const exclude = ['META-INF/', ...task.exclude]

  return new Promise((resolve, reject) => {
    yauzl.open(task.archive, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError || !zip) {
        reject(openError ?? new Error('Не удалось открыть архив'))
        return
      }

      const written: string[] = []
      zip.readEntry()

      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName
        if (name.endsWith('/') || exclude.some((prefix) => name.startsWith(prefix))) {
          zip.readEntry()
          return
        }
        const destination = path.join(task.target, ...name.split('/'))
        if (!destination.startsWith(task.target)) {
          zip.readEntry()
          return
        }

        zip.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            reject(streamError ?? new Error(`Не читается запись ${name}`))
            return
          }
          void mkdir(path.dirname(destination), { recursive: true })
            .then(() => pipeline(readStream, createWriteStream(destination)))
            .then(() => {
              written.push(destination)
              zip.readEntry()
            })
            .catch(reject)
        })
      })

      zip.on('end', () => resolve(written))
      zip.on('error', reject)
    })
  })
}

function mapCode(code?: string): string | undefined {
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' ? 'FILE_LOCKED' : undefined
}
