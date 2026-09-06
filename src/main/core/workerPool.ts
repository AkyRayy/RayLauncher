import { Worker } from 'node:worker_threads'
import { win32 as path } from 'node:path'
import { cpus } from 'node:os'
import { RayError } from '@shared/errors'

interface Pending<R> {
  resolve: (value: R) => void
  reject: (error: unknown) => void
}

interface WorkerMessage {
  id: number
  result?: unknown
  error?: { message: string; code?: string }
}

export class WorkerPool<TTask, TResult> {
  private readonly workers: Worker[] = []
  private readonly pending = new Map<number, Pending<TResult>>()
  private next = 0
  private counter = 0

  constructor(
    private readonly scriptName: string,
    private readonly size = Math.max(2, Math.min(4, cpus().length - 1))
  ) {}

  run(task: TTask): Promise<TResult> {
    this.ensureStarted()
    const id = (this.counter += 1)
    const worker = this.workers[this.next % this.workers.length]
    this.next += 1

    return new Promise<TResult>((resolve, reject) => {
      if (!worker) {
        reject(new RayError('INTERNAL', 'Не удалось запустить рабочий поток'))
        return
      }
      this.pending.set(id, { resolve, reject })
      worker.postMessage({ id, task })
    })
  }

  async dispose(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()))
    this.workers.length = 0
    this.pending.clear()
  }

  private ensureStarted(): void {
    if (this.workers.length > 0) return

    const file = path.join(__dirname, 'workers', this.scriptName)

    for (let index = 0; index < this.size; index += 1) {
      const worker = new Worker(file)
      worker.on('message', (message: WorkerMessage) => this.settle(message))
      worker.on('error', (error) => this.failAll(error))
      worker.unref()
      this.workers.push(worker)
    }
  }

  private settle(message: WorkerMessage): void {
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)

    if (message.error) {
      pending.reject(
        new RayError(
          message.error.code === 'FILE_LOCKED' ? 'FILE_LOCKED' : 'INTERNAL',
          message.error.message
        )
      )
      return
    }
    pending.resolve(message.result as TResult)
  }

  private failAll(error: unknown): void {
    for (const [, pending] of this.pending) pending.reject(error)
    this.pending.clear()
  }
}
