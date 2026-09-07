import { randomUUID } from 'node:crypto'
import { SERVERS } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { GameServer } from '@shared/types'
import { statement } from './database'

interface ServerRow {
  id: string
  name: string
  address: string
  port: number
  favorite: number
  created_at: number
  updated_at: number
}

const SELECT = 'SELECT id, name, address, port, favorite, created_at, updated_at FROM servers'

export function listServers(): GameServer[] {
  const rows = statement(`${SELECT} ORDER BY favorite DESC, name COLLATE NOCASE`).all() as unknown as ServerRow[]
  return rows.map(toServer)
}

export function findServer(id: string): GameServer | null {
  const row = statement(`${SELECT} WHERE id = ?`).get(id) as unknown as ServerRow | undefined
  return row ? toServer(row) : null
}

export function requireServer(id: string): GameServer {
  const server = findServer(id)
  if (!server) throw new RayError('INVALID_INPUT', 'Сервер не найден', { serverId: id })
  return server
}

export function addServer(input: { name: string; address: string; port?: number }): GameServer {
  const now = Date.now()
  const server: GameServer = {
    id: `s-${randomUUID().slice(0, 8)}`,
    name: input.name.trim(),
    address: normalizeAddress(input.address),
    port: input.port ?? SERVERS.defaultPort,
    favorite: false,
    createdAt: now,
    updatedAt: now
  }

  statement(`
    INSERT INTO servers (id, name, address, port, favorite, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(server.id, server.name, server.address, server.port, 0, server.createdAt, server.updatedAt)

  return server
}

export function updateServer(
  id: string,
  patch: { name?: string; address?: string; port?: number; favorite?: boolean }
): GameServer {
  const current = requireServer(id)
  const next: GameServer = {
    ...current,
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.address !== undefined ? { address: normalizeAddress(patch.address) } : {}),
    ...(patch.port !== undefined ? { port: patch.port } : {}),
    ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
    updatedAt: Date.now()
  }

  if (next.name.length === 0) throw new RayError('INVALID_INPUT', 'Укажите название сервера')

  statement('UPDATE servers SET name = ?, address = ?, port = ?, favorite = ?, updated_at = ? WHERE id = ?').run(
    next.name,
    next.address,
    next.port,
    next.favorite ? 1 : 0,
    next.updatedAt,
    id
  )
  return next
}

export function deleteServer(id: string): void {
  statement('DELETE FROM servers WHERE id = ?').run(id)
}

/** Принимает «play.example.com», «play.example.com:25570» и «1.2.3.4:25565». Порт отрезается. */
export function normalizeAddress(raw: string): string {
  const trimmed = raw.trim().replace(/^minecraft:\/\//i, '')
  const withoutPort = trimmed.includes(':') && !trimmed.endsWith(':') ? trimmed.slice(0, trimmed.lastIndexOf(':')) : trimmed
  const host = withoutPort.trim().toLowerCase()

  if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host) &&
      !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    throw new RayError('INVALID_INPUT', `Некорректный адрес сервера: ${raw.trim()}`, { address: raw.trim() })
  }
  return host
}

function toServer(row: ServerRow): GameServer {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    port: row.port,
    favorite: row.favorite === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
