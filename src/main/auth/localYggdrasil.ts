import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { RayError } from '@shared/errors'
import { uuidWithDashes, uuidWithoutDashes } from '@shared/util'
import { pathExists } from '../core/fsx'
import { paths } from '../core/paths'
import { logger } from '../logger'

export interface LocalProfile {
  uuid: string
  name: string
  skinHash?: string
  variant: 'classic' | 'slim'
}

let server: Server | null = null
let origin = ''
const profiles = new Map<string, LocalProfile>()

export function localYggdrasilOrigin(): string {
  return origin
}

export function isLocalYggdrasilRunning(): boolean {
  return server !== null
}

export function registerLocalProfile(profile: LocalProfile): void {
  profiles.set(profile.uuid.toLowerCase(), profile)
}

export function unregisterLocalProfile(uuid: string): void {
  profiles.delete(uuid.toLowerCase())
}

export async function startLocalYggdrasil(): Promise<string> {
  if (server) return origin

  const instance = createServer((incoming, response) => {
    void handle(incoming, response).catch((error: unknown) => {
      logger.warn(`Локальный Yggdrasil: ${error instanceof Error ? error.message : String(error)}`)
      json(response, 500, { error: 'InternalError' })
    })
  })

  const port = await listen(instance)
  server = instance
  origin = `http://127.0.0.1:${port}`
  logger.info(`Локальный Yggdrasil слушает ${origin}`)
  return origin
}

export function stopLocalYggdrasil(): void {
  server?.close()
  server = null
  origin = ''
}

function listen(instance: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    instance.once('error', reject)
    instance.listen(0, '127.0.0.1', () => {
      const address = instance.address()
      if (address === null || typeof address === 'string') {
        reject(new RayError('INTERNAL', 'Не удалось открыть порт для локального Yggdrasil'))
        return
      }
      resolve(address.port)
    })
  })
}

async function handle(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(incoming.url ?? '/', origin || 'http://127.0.0.1')
  const route = url.pathname

  if (route === '/' || route === '') {
    json(response, 200, {
      meta: {
        serverName: 'RayLauncher Offline',
        implementationName: 'raylauncher',
        implementationVersion: '1.0.0'
      },
      skinDomains: ['127.0.0.1', 'localhost'],
      signaturePublickey: ''
    })
    return
  }

  if (route.startsWith('/authserver/')) {
    if (route.endsWith('/validate') || route.endsWith('/invalidate') || route.endsWith('/signout')) {
      response.writeHead(204).end()
      return
    }
    json(response, 200, { accessToken: 'offline', clientToken: 'offline' })
    return
  }

  if (route === '/sessionserver/session/minecraft/join') {
    response.writeHead(204).end()
    return
  }

  if (route === '/sessionserver/session/minecraft/hasJoined') {
    const name = url.searchParams.get('username') ?? ''
    const profile = [...profiles.values()].find((item) => item.name === name)
    if (!profile) {
      response.writeHead(204).end()
      return
    }
    json(response, 200, await profileResponse(profile))
    return
  }

  if (route.startsWith('/sessionserver/session/minecraft/profile/')) {
    const uuid = uuidWithoutDashes(route.split('/').pop() ?? '').toLowerCase()
    const profile = profiles.get(uuid)
    if (!profile) {
      response.writeHead(204).end()
      return
    }
    json(response, 200, await profileResponse(profile))
    return
  }

  if (route === '/api/profiles/minecraft') {
    const body = await readBody(incoming)
    const names: unknown = body.length > 0 ? JSON.parse(body) : []
    const requested = Array.isArray(names) ? names.map(String) : []
    const found = [...profiles.values()]
      .filter((profile) => requested.includes(profile.name))
      .map((profile) => ({ id: profile.uuid, name: profile.name }))
    json(response, 200, found)
    return
  }

  if (route.startsWith('/textures/')) {
    const hash = path.basename(route).replace(/\.png$/i, '')
    const file = path.join(paths().skins, `${hash}.png`)
    if (!/^[a-f0-9]{40}$/i.test(hash) || !(await pathExists(file))) {
      response.writeHead(404).end()
      return
    }
    const data = await readFile(file)
    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length })
    response.end(data)
    return
  }

  response.writeHead(404).end()
}

async function profileResponse(profile: LocalProfile): Promise<unknown> {
  const textures: Record<string, unknown> = {}

  if (profile.skinHash) {
    textures.SKIN = {
      url: `${origin}/textures/${profile.skinHash}.png`,
      ...(profile.variant === 'slim' ? { metadata: { model: 'slim' } } : {})
    }
  }

  const payload = {
    timestamp: Date.now(),
    profileId: profile.uuid,
    profileName: profile.name,
    textures
  }

  return {
    id: profile.uuid,
    name: profile.name,
    properties: [
      { name: 'textures', value: Buffer.from(JSON.stringify(payload), 'utf8').toString('base64') }
    ]
  }
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  })
  response.end(body)
}

function readBody(incoming: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    incoming.setEncoding('utf8')
    incoming.on('data', (chunk: string) => {
      data += chunk
      if (data.length > 64 * 1024) incoming.destroy()
    })
    incoming.on('end', () => resolve(data))
    incoming.on('error', () => resolve(''))
  })
}

export function formatProfileUuid(uuid: string): string {
  return uuidWithDashes(uuid)
}
