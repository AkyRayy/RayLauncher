import { randomUUID } from 'node:crypto'
import { createConnection, type Socket } from 'node:net'
import { DISCORD } from '@shared/constants'
import type { DiscordStatus, GameState } from '@shared/types'
import { findProfile } from '../db/profiles.repo'
import { onGameState } from '../minecraft/launcher'
import { getSettings } from '../store/settings.store'
import { logger } from '../logger'

const OP_HANDSHAKE = 0
const OP_FRAME = 1

export function encodeHandshake(clientId: string): Buffer {
  return encodeFrame(OP_HANDSHAKE, { v: 1, client_id: clientId })
}

export interface ActivityInput {
  details: string
  state: string
  startedAt: number
}

export function encodeSetActivity(input: ActivityInput, nonce = randomUUID()): Buffer {
  return encodeFrame(OP_FRAME, {
    cmd: 'SET_ACTIVITY',
    nonce,
    args: {
      pid: process.pid,
      activity: {
        details: input.details.slice(0, 128),
        state: input.state.slice(0, 128),
        timestamps: { start: Math.floor(input.startedAt / 1000) },
        assets: {
          large_image: DISCORD.appAssets.largeImage,
          large_text: 'RayLauncher',
          small_image: DISCORD.appAssets.smallImage,
          small_text: 'Minecraft'
        }
      }
    }
  })
}

function encodeFrame(opcode: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

function pipePath(index: number): string {
  return process.platform === 'win32'
    ? `\\\\?\\pipe\\${DISCORD.pipeName}-${index}`
    : `/tmp/${DISCORD.pipeName}-${index}`
}

class PresenceConnection {
  private socket: Socket | null = null
  private connecting: Promise<void> | null = null

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed
  }

  async ensure(clientId: string): Promise<boolean> {
    if (this.connected) return true
    if (this.connecting) {
      await this.connecting.catch(() => undefined)
      return this.connected
    }

    this.connecting = this.dial(clientId)
    try {
      await this.connecting
      return this.connected
    } catch {
      return false
    } finally {
      this.connecting = null
    }
  }

  private dial(clientId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const errors: unknown[] = []
      const attempt = (index: number): void => {
        if (index > DISCORD.maxPipeIndex) {
          reject(errors[0] ?? new Error('Discord не найден'))
          return
        }

        const socket = createConnection(pipePath(index))
        const fail = (error: unknown): void => {
          socket.destroy()
          errors.push(error)
          attempt(index + 1)
        }

        socket.once('error', fail)
        socket.once('connect', () => {
          socket.removeListener('error', fail)
          socket.on('error', () => this.disconnect())
          socket.on('close', () => {
            if (this.socket === socket) this.socket = null
          })
          // Ответы Discord читаем и отбрасываем — нам важен сам факт соединения.
          socket.on('data', () => undefined)

          this.socket = socket
          socket.write(encodeHandshake(clientId), (error) => {
            if (error) fail(error)
            else resolve()
          })
        })
      }
      attempt(0)
    })
  }

  sendActivity(input: ActivityInput): void {
    this.socket?.write(encodeSetActivity(input))
  }

  disconnect(): void {
    this.socket?.destroy()
    this.socket = null
  }
}

const connection = new PresenceConnection()
let lastSignature = ''
let wired = false

function signatureOf(input: ActivityInput | null): string {
  return input ? `${input.details} ${input.state}` : ''
}

export async function refreshPresence(game: GameState | null): Promise<void> {
  let settings
  try {
    settings = getSettings()
  } catch {
    return
  }

  const active = game !== null && (game.phase === 'running' || game.phase === 'launching')
  const clientId = settings.discordClientId.trim()

  if (!settings.discordPresence || clientId.length === 0 || !active || !game) {
    if (connection.connected) {
      connection.disconnect()
      logger.debug('Discord Presence отключён')
    }
    lastSignature = ''
    return
  }

  const input = activityFor(game)
  if (signatureOf(input) === lastSignature && connection.connected) return

  const ok = await connection.ensure(clientId)
  if (!ok) return

  connection.sendActivity(input)
  lastSignature = signatureOf(input)
  logger.debug(`Discord Presence: ${input.details} — ${input.state}`)
}

function activityFor(game: GameState): ActivityInput {
  const profile = profileName(game.profileId)
  const version = gameVersion(game.profileId)
  return {
    details: version ? `Minecraft ${version}` : 'Minecraft',
    state: profile,
    startedAt: game.startedAt ?? Date.now()
  }
}

function profileName(profileId: string): string {
  try {
    return findProfile(profileId)?.name ?? 'Быстрая игра'
  } catch {
    return 'Быстрая игра'
  }
}

function gameVersion(profileId: string): string {
  try {
    return findProfile(profileId)?.gameVersion ?? ''
  } catch {
    return ''
  }
}

export function discordStatus(): DiscordStatus {
  return { connected: connection.connected, configured: isPresenceConfigured() }
}

function isPresenceConfigured(): boolean {
  try {
    const settings = getSettings()
    return settings.discordPresence && settings.discordClientId.trim().length > 0
  } catch {
    return false
  }
}

export function initPresence(): void {
  if (wired) return
  wired = true
  onGameState((game) => {
    void refreshPresence(game).catch(() => undefined)
  })
}

export function disposePresence(): void {
  connection.disconnect()
  lastSignature = ''
}
