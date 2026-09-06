import { createWriteStream } from 'node:fs'
import { open, rename, rm } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { RayError } from '@shared/errors'
import { ensureDir, fileSize, wrapFsError } from '../core/fsx'
import { verifyFile } from '../core/hash'
import { request } from '../core/http'
import type { DownloadSpec } from './types'

export type DownloadOutcome = 'downloaded' | 'skipped'

export interface DownloadOptions {
  signal: AbortSignal
  onChunk: (bytes: number) => void
}

export async function downloadFile(
  spec: DownloadSpec,
  options: DownloadOptions
): Promise<DownloadOutcome> {
  if (await verifyFile(spec.dest, { sha1: spec.sha1, size: spec.size })) {
    return 'skipped'
  }

  const urls = [spec.url, ...(spec.fallbackUrls ?? [])]
  let lastError: unknown = null

  for (const url of urls) {
    try {
      await fetchToDisk(url, spec, options)
      return 'downloaded'
    } catch (error) {
      lastError = error
      if (options.signal.aborted) break
    }
  }

  throw RayError.from(lastError, 'HTTP_ERROR')
}

async function fetchToDisk(url: string, spec: DownloadSpec, options: DownloadOptions): Promise<void> {
  const partial = `${spec.dest}.part`
  await ensureDir(path.dirname(spec.dest))

  const existing = (await fileSize(partial)) ?? 0
  const resumeFrom = spec.size > 0 && existing > 0 && existing < spec.size ? existing : 0
  if (resumeFrom === 0 && existing > 0) await rm(partial, { force: true })

  const response = await request(url, {
    ...(resumeFrom > 0 ? { range: `bytes=${resumeFrom}-` } : {}),
    signal: options.signal
  })

  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `Ответ ${response.status} при загрузке ${spec.label}`, {
      url,
      status: response.status
    })
  }
  if (!response.body) {
    throw new RayError('HTTP_ERROR', `Пустой ответ при загрузке ${spec.label}`, { url })
  }

  const append = resumeFrom > 0 && response.status === 206
  const handle = await open(partial, append ? 'a' : 'w')

  try {
    const counter = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        options.onChunk(chunk.length)
        callback()
      }
    })

    const sink = createWriteStream('', { fd: handle.fd, autoClose: false })
    await pipeline(response.body as unknown as NodeJS.ReadableStream, async function* (source) {
      for await (const chunk of source) {
        counter.write(chunk)
        yield chunk as Buffer
      }
    }, sink)
  } catch (error) {
    throw wrapFsError(error, partial)
  } finally {
    await handle.close()
  }

  if (spec.sha1 || spec.size > 0) {
    const valid = await verifyFile(partial, { sha1: spec.sha1, size: spec.size })
    if (!valid) {
      await rm(partial, { force: true })
      throw new RayError('SHA1_MISMATCH', `Файл ${spec.label} скачался повреждённым`, {
        url,
        dest: spec.dest
      })
    }
  }

  await rename(partial, spec.dest)
}
