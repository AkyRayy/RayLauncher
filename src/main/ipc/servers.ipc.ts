import type { GameState, ServerStatus } from '@shared/types'
import { handle } from './registry'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import {
  addServer,
  deleteServer,
  listServers,
  requireServer,
  updateServer
} from '../db/servers.repo'
import { pingServer } from '../servers/ping'
import { launchProfile } from '../profiles/profileService'
import { listProfiles } from '../db/profiles.repo'

export function registerServersIpc(): void {
  handle('servers:list', () => listServers())

  handle('servers:add', (input) => addServer(input))

  handle('servers:update', ({ id, patch }) => updateServer(id, patch))

  handle('servers:remove', ({ id }) => {
    deleteServer(id)
  })

  handle('servers:ping', async ({ id }): Promise<ServerStatus> => {
    const server = requireServer(id)
    return pingServer(server.address, server.port)
  })

  handle('servers:pingAll', async (): Promise<Record<string, ServerStatus>> => {
    const servers = listServers()
    const entries = await Promise.all(
      servers.map(async (server) => {
        const status = await pingServer(server.address, server.port).catch(
          (): ServerStatus => ({ online: false, error: 'Не удалось подключиться' })
        )
        return [server.id, status] as const
      })
    )
    return Object.fromEntries(entries)
  })

  handle('servers:connect', async ({ serverId, profileId }): Promise<GameState> => {
    const server = requireServer(serverId)
    logger.info(`Быстрое подключение к ${server.name} (${server.address}:${server.port})`)

    const state = await launchProfile(profileId, {
      extraGameArgs: ['--server', server.address, '--port', String(server.port)]
    })
    emitEvent('profiles:changed', listProfiles())
    return state
  })
}
