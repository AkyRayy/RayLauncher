import { ipcMain } from 'electron'
import type { z } from 'zod'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import { requestSchemas } from '@shared/schemas'
import { RayError } from '@shared/errors'
import { logger } from '../logger'

export type Handler<C extends IpcChannel> = (
  payload: IpcRequest<C>
) => IpcResponse<C> | Promise<IpcResponse<C>>

const registered = new Set<IpcChannel>()

export function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  if (registered.has(channel)) {
    throw new Error(`Канал ${channel} уже зарегистрирован`)
  }
  registered.add(channel)

  const schema = requestSchemas[channel] as z.ZodType<IpcRequest<C>>

  ipcMain.handle(channel, async (_event, raw: unknown) => {
    const startedAt = performance.now()
    try {
      const parsed = schema.safeParse(raw)
      if (!parsed.success) {
        throw new RayError('INVALID_INPUT', `Некорректные данные для ${channel}`, {
          issues: parsed.error.issues.slice(0, 5)
        })
      }
      const result = await handler(parsed.data)
      logger.debug(`ipc ${channel} ok ${Math.round(performance.now() - startedAt)} мс`)
      return result
    } catch (error) {
      const rayError = RayError.from(error)
      logger.error(
        `ipc ${channel} ${rayError.code} ${Math.round(performance.now() - startedAt)} мс: ${rayError.message}`
      )
      throw new Error(JSON.stringify(rayError.toJSON()), { cause: error })
    }
  })
}

export function registeredChannels(): IpcChannel[] {
  return [...registered]
}
