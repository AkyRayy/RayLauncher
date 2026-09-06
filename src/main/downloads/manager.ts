import { randomUUID } from 'node:crypto'
import type { DownloadTask } from '@shared/types'
import { RayError } from '@shared/errors'
import { smoothSpeed } from '@shared/util'
import { emitEvent } from '../core/events'
import { getSettings } from '../store/settings.store'
import { logger } from '../logger'
import { downloadFile } from './task'
import type { DownloadSpec } from './types'

interface Record {
  task: DownloadTask
  spec: DownloadSpec
  controller: AbortController
  batch?: Batch
  lastTick: number
  lastReceived: number
  attempts: number
}

interface Batch {
  id: string
  bytesTotal: number
  bytesDone: number
  filesTotal: number
  filesDone: number
  currentLabel: string
  onProgress?: (state: BatchProgress) => void
  resolve: () => void
  reject: (error: unknown) => void
  failed: boolean
}

export interface BatchProgress {
  bytesDone: number
  bytesTotal: number
  filesDone: number
  filesTotal: number
  currentLabel: string
}

export interface BatchHandle {
  id: string
  promise: Promise<void>
  cancel(): void
}

const PROGRESS_THROTTLE_MS = 180
const MAX_AUTO_RETRIES = 2

const records = new Map<string, Record>()
const queue: string[] = []
const batches = new Map<string, Batch>()
let running = 0

export function enqueueBatch(
  specs: DownloadSpec[],
  options: { onProgress?: (state: BatchProgress) => void } = {}
): BatchHandle {
  const id = randomUUID()
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((resolveFn, rejectFn) => {
    resolve = resolveFn
    reject = rejectFn
  })

  const batch: Batch = {
    id,
    bytesTotal: specs.reduce((sum, spec) => sum + spec.size, 0),
    bytesDone: 0,
    filesTotal: specs.length,
    filesDone: 0,
    currentLabel: specs[0]?.label ?? '',
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    resolve,
    reject,
    failed: false
  }
  batches.set(id, batch)

  for (const spec of specs) addTask(spec, batch)

  if (specs.length === 0) {
    batches.delete(id)
    resolve()
  } else {
    pump()
  }

  return {
    id,
    promise,
    cancel: () => cancelBatch(id)
  }
}

export function listTasks(): DownloadTask[] {
  return [...records.values()].map((record) => ({ ...record.task }))
}

export function pauseTask(taskId: string): void {
  const record = records.get(taskId)
  if (!record || record.task.state !== 'running') {
    if (record?.task.state === 'queued') {
      removeFromQueue(taskId)
      update(record, { state: 'paused' })
    }
    return
  }
  record.controller.abort()
  update(record, { state: 'paused' })
}

export function resumeTask(taskId: string): void {
  const record = records.get(taskId)
  if (!record || record.task.state !== 'paused') return
  record.controller = new AbortController()
  update(record, { state: 'queued' })
  queue.push(taskId)
  pump()
}

export function cancelTask(taskId: string): void {
  const record = records.get(taskId)
  if (!record) return
  record.controller.abort()
  removeFromQueue(taskId)
  update(record, { state: 'error', error: 'Отменено пользователем' })
  records.delete(taskId)
}

export function retryTask(taskId: string): void {
  const record = records.get(taskId)
  if (!record || record.task.state !== 'error') return
  record.controller = new AbortController()
  record.attempts = 0
  update(record, { state: 'queued', received: 0, error: undefined })
  queue.push(taskId)
  pump()
}

export function clearFinished(): void {
  for (const [id, record] of records) {
    if (record.task.state === 'done' || record.task.state === 'error') records.delete(id)
  }
}

export function taskById(taskId: string): DownloadTask | undefined {
  return records.get(taskId)?.task
}

export function cancelBatch(batchId: string): void {
  for (const [id, record] of records) {
    if (record.batch?.id === batchId) cancelTask(id)
  }
  const batch = batches.get(batchId)
  if (batch && !batch.failed) {
    batch.failed = true
    batches.delete(batchId)
    batch.reject(new RayError('MS_CANCELLED', 'Загрузка отменена'))
  }
}

function addTask(spec: DownloadSpec, batch: Batch): void {
  const id = randomUUID()
  const task: DownloadTask = {
    id,
    kind: spec.kind,
    url: spec.url,
    dest: spec.dest,
    size: spec.size,
    received: 0,
    state: 'queued',
    label: spec.label,
    ...(spec.sha1 ? { sha1: spec.sha1 } : {}),
    ...(spec.profileId ? { profileId: spec.profileId } : {})
  }

  records.set(id, {
    task,
    spec,
    controller: new AbortController(),
    batch,
    lastTick: Date.now(),
    lastReceived: 0,
    attempts: 0
  })
  queue.push(id)
}

function pump(): void {
  const limit = getSettings().concurrency

  while (running < limit && queue.length > 0) {
    const id = queue.shift()
    if (!id) break
    const record = records.get(id)
    if (!record || record.task.state !== 'queued') continue

    running += 1
    void runTask(record).finally(() => {
      running -= 1
      pump()
    })
  }
}

async function runTask(record: Record): Promise<void> {
  update(record, { state: 'running' })
  record.lastTick = Date.now()
  record.lastReceived = 0

  try {
    const outcome = await downloadFile(record.spec, {
      signal: record.controller.signal,
      onChunk: (bytes) => onChunk(record, bytes)
    })

    if (outcome === 'skipped') {
      const remaining = Math.max(0, record.task.size - record.task.received)
      addBatchBytes(record.batch, remaining)
      update(record, { received: record.task.size })
    }

    update(record, { state: 'done', speedBps: 0 })
    completeInBatch(record)
  } catch (error) {
    if (record.task.state === 'paused') return

    const rayError = RayError.from(error)
    const retryable = rayError.code !== 'MS_CANCELLED' && record.attempts < MAX_AUTO_RETRIES

    if (retryable) {
      record.attempts += 1
      record.controller = new AbortController()
      update(record, { state: 'queued', received: 0 })
      queue.push(record.task.id)
      logger.warn(`Повтор загрузки ${record.task.label} (${record.attempts}/${MAX_AUTO_RETRIES}): ${rayError.code}`)
      return
    }

    update(record, { state: 'error', error: rayError.message, speedBps: 0 })
    failBatch(record, rayError)
  }
}

function onChunk(record: Record, bytes: number): void {
  record.task.received += bytes
  addBatchBytes(record.batch, bytes)

  const now = Date.now()
  const elapsed = now - record.lastTick
  if (elapsed < PROGRESS_THROTTLE_MS) return

  const delta = record.task.received - record.lastReceived
  record.task.speedBps = smoothSpeed(record.task.speedBps, (delta / elapsed) * 1000)
  record.lastTick = now
  record.lastReceived = record.task.received

  emitEvent('download:progress', { ...record.task })
  notifyBatch(record.batch, record.task.label)
}

function addBatchBytes(batch: Batch | undefined, bytes: number): void {
  if (!batch) return
  batch.bytesDone += bytes
}

function completeInBatch(record: Record): void {
  const batch = record.batch
  if (!batch) return

  batch.filesDone += 1
  batch.currentLabel = record.task.label
  notifyBatch(batch, record.task.label)

  if (batch.filesDone >= batch.filesTotal && !batch.failed) {
    batches.delete(batch.id)
    batch.resolve()
  }
}

function failBatch(record: Record, error: RayError): void {
  const batch = record.batch
  if (!batch || batch.failed) return
  batch.failed = true
  batches.delete(batch.id)
  batch.reject(error)
}

function notifyBatch(batch: Batch | undefined, label: string): void {
  if (!batch?.onProgress) return
  batch.onProgress({
    bytesDone: batch.bytesDone,
    bytesTotal: batch.bytesTotal,
    filesDone: batch.filesDone,
    filesTotal: batch.filesTotal,
    currentLabel: label
  })
}

function removeFromQueue(taskId: string): void {
  const index = queue.indexOf(taskId)
  if (index >= 0) queue.splice(index, 1)
}

function update(record: Record, patch: Partial<DownloadTask>): void {
  Object.assign(record.task, patch)
  if (patch.error === undefined && 'error' in patch) delete record.task.error
  emitEvent('download:progress', { ...record.task })
}
