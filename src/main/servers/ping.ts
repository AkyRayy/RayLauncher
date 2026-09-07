import { connect, type Socket } from 'node:net'
import { z } from 'zod'
import { SERVERS } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { ServerStatus } from '@shared/types'

const statusSchema = z.object({
  version: z.object({ name: z.string().default(''), protocol: z.number().optional() }).nullish(),
  players: z.object({ max: z.number().default(0), online: z.number().default(0) }).nullish(),
  description: z.unknown().nullish(),
  favicon: z.string().optional()
})

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let rest = value >>> 0
  do {
    let part = rest & 0x7f
    rest >>>= 7
    if (rest !== 0) part |= 0x80
    bytes.push(part)
  } while (rest !== 0)
  return Buffer.from(bytes)
}

export function readVarInt(buffer: Buffer, offset = 0): { value: number; bytes: number } {
  let value = 0
  let bytes = 0
  for (let shift = 0; shift < 35; shift += 7) {
    const byte = buffer[offset + bytes]
    if (byte === undefined) throw new RayError('NET_TIMEOUT', 'Обрыв пакета при пинге сервера')
    bytes += 1
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return { value: value | 0, bytes }
  }
  throw new RayError('HTTP_ERROR', 'Слишком длинный varint в ответе сервера')
}

function writeString(value: string): Buffer {
  const body = Buffer.from(value, 'utf8')
  return Buffer.concat([writeVarInt(body.length), body])
}

function handshakePacket(address: string, port: number): Buffer {
  const body = Buffer.concat([
    writeVarInt(0x00),
    writeVarInt(SERVERS.protocolVersion),
    writeString(address),
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1)
  ])
  return Buffer.concat([writeVarInt(body.length), body])
}

function statusRequestPacket(): Buffer {
  const body = writeVarInt(0x00)
  return Buffer.concat([writeVarInt(body.length), body])
}

/** Секционные коды § + старый формат & из MOTD — в чистый текст. */
export function stripMotd(input: string): string {
  return input
    .replace(/§[0-9a-fklmnor]/gi, '')
    .replace(/&[0-9a-fklmnor]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SERVERS.maxMotdLength)
}

const textPartSchema = z.object({ text: z.string().optional(), extra: z.array(z.unknown()).optional() })

export function motdToPlain(description: unknown): string {
  if (typeof description === 'string') return stripMotd(description)
  if (Array.isArray(description)) {
    return stripMotd(description.map((part) => motdToPlain(part)).join(''))
  }

  const parsed = textPartSchema.safeParse(description)
  if (!parsed.success) return ''
  const head = parsed.data.text ?? ''
  const tail = (parsed.data.extra ?? []).map((part) => motdToPlain(part)).join('')
  return stripMotd(`${head}${tail}`)
}

export function parseStatusResponse(json: string, latencyMs: number): ServerStatus {
  let raw: unknown
  try {
    raw = JSON.parse(json) as unknown
  } catch {
    return { online: false, error: 'Сервер вернул мусор вместо статуса' }
  }

  const parsed = statusSchema.safeParse(raw)
  if (!parsed.success) return { online: false, error: 'Неожиданный формат статуса' }
  if (!parsed.data.version && !parsed.data.players && !parsed.data.description && !parsed.data.favicon) {
    return { online: false, error: 'Сервер вернул пустой статус' }
  }

  const status: ServerStatus = {
    online: true,
    latencyMs,
    ...(parsed.data.version?.name ? { version: parsed.data.version.name } : {}),
    ...(parsed.data.players ? { playersOnline: parsed.data.players.online, playersMax: parsed.data.players.max } : {}),
    ...(parsed.data.favicon?.startsWith('data:image/') ? { favicon: parsed.data.favicon } : {})
  }

  const motd = motdToPlain(parsed.data.description)
  if (motd) status.motd = motd
  return status
}

/** Классический Server List Ping: handshake → status → JSON. */
export async function pingServer(
  address: string,
  port: number,
  timeoutMs = SERVERS.pingTimeoutMs
): Promise<ServerStatus> {
  const startedAt = Date.now()

  return new Promise((resolve) => {
    let socket: Socket | null = null
    let settled = false
    const chunks: Buffer[] = []

    const finish = (status: ServerStatus): void => {
      if (settled) return
      settled = true
      socket?.destroy()
      resolve(status)
    }

    const timer = setTimeout(() => {
      finish({ online: false, error: 'Превышено время ожидания' })
    }, timeoutMs)
    timer.unref()

    try {
      socket = connect(port, address)
    } catch (error) {
      clearTimeout(timer)
      finish({ online: false, error: error instanceof Error ? error.message : 'Не удалось подключиться' })
      return
    }

    socket.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      const code = error.code ?? ''
      const message =
        code === 'ENOTFOUND' || code === 'EAI_AGAIN'
          ? 'Не найден адрес сервера'
          : code === 'ECONNREFUSED'
            ? 'Сервер не принимает подключения'
            : code === 'ETIMEDOUT'
              ? 'Превышено время ожидания'
              : 'Не удалось подключиться'
      finish({ online: false, error: message })
    })

    socket.on('connect', () => {
      try {
        socket?.write(handshakePacket(address, port))
        socket?.write(statusRequestPacket())
      } catch {
        clearTimeout(timer)
        finish({ online: false, error: 'Не удалось отправить запрос' })
      }
    })

    socket.on('data', (data: Buffer) => {
      chunks.push(data)
      const buffer = Buffer.concat(chunks)

      try {
        const length = readVarInt(buffer, 0)
        if (buffer.length < length.bytes + length.value) return

        const packetId = readVarInt(buffer, length.bytes)
        const textStart = length.bytes + packetId.bytes
        const textLength = readVarInt(buffer, textStart)
        const jsonStart = textStart + textLength.bytes
        const json = buffer.subarray(jsonStart, jsonStart + textLength.value).toString('utf8')

        clearTimeout(timer)
        finish(parseStatusResponse(json, Date.now() - startedAt))
      } catch (error) {
        // Ждём остаток пакета, если данных просто не хватило.
        if (error instanceof RayError && error.code === 'NET_TIMEOUT') return
        clearTimeout(timer)
        finish({ online: false, error: 'Битый ответ сервера' })
      }
    })
  })
}
