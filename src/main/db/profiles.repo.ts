import { randomUUID } from 'node:crypto'
import type { LoaderKind, Profile } from '@shared/types'
import { RayError } from '@shared/errors'
import { statement, transaction } from './database'
import { MEMORY } from '@shared/constants'

interface ProfileRow {
  id: string
  name: string
  icon: string | null
  game_version: string
  loader_kind: string
  loader_ver: string | null
  version_id: string | null
  account_id: string | null
  java_json: string
  memory_json: string
  window_json: string | null
  jvm_args: string
  game_args: string
  offline_skins: number
  created: number
  updated: number
  last_played: number | null
}

const SELECT = `
  SELECT id, name, icon, game_version, loader_kind, loader_ver, version_id, account_id,
         java_json, memory_json, window_json, jvm_args, game_args,
         offline_skins, created, updated, last_played
  FROM profiles
`

export function listProfiles(): Profile[] {
  const rows = statement(`${SELECT} ORDER BY last_played DESC NULLS LAST, updated DESC`).all() as unknown as ProfileRow[]
  return rows.map(toProfile)
}

export function findProfile(id: string): Profile | null {
  const row = statement(`${SELECT} WHERE id = ?`).get(id) as unknown as ProfileRow | undefined
  return row ? toProfile(row) : null
}

export function requireProfile(id: string): Profile {
  const profile = findProfile(id)
  if (!profile) throw new RayError('PROFILE_NOT_FOUND', 'Профиль не найден', { profileId: id })
  return profile
}

export interface CreateProfileInput {
  name: string
  gameVersion: string
  loader: { kind: LoaderKind; version?: string }
  icon?: string
  accountId?: string
  java?: Profile['java']
  memory?: Profile['memory']
  window?: Profile['window']
  jvmArgs?: string[]
  gameArgs?: string[]
  offlineSkins?: boolean
}

export function createProfile(input: CreateProfileInput): Profile {
  const now = Date.now()
  const id = `p-${randomUUID().slice(0, 8)}`

  const profile: Profile = {
    id,
    name: input.name.trim(),
    ...(input.icon ? { icon: input.icon } : {}),
    gameVersion: input.gameVersion,
    loader: input.loader,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    java: input.java ?? { mode: 'auto' },
    memory: input.memory ?? { auto: true, minMb: 2048, maxMb: 4096 },
    ...(input.window ? { window: input.window } : {}),
    jvmArgs: input.jvmArgs ?? [],
    gameArgs: input.gameArgs ?? [],
    offlineSkins: input.offlineSkins ?? true,
    created: now,
    updated: now
  }

  statement(`
    INSERT INTO profiles (id, name, icon, game_version, loader_kind, loader_ver, version_id,
                          account_id, java_json, memory_json, window_json, jvm_args, game_args,
                          offline_skins, created, updated, last_played)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    profile.id,
    profile.name,
    profile.icon ?? null,
    profile.gameVersion,
    profile.loader.kind,
    profile.loader.version ?? null,
    profile.resolvedVersionId ?? null,
    profile.accountId ?? null,
    JSON.stringify(profile.java),
    JSON.stringify(profile.memory),
    profile.window ? JSON.stringify(profile.window) : null,
    JSON.stringify(profile.jvmArgs),
    JSON.stringify(profile.gameArgs),
    profile.offlineSkins ? 1 : 0,
    profile.created,
    profile.updated
  )

  return profile
}

export type ProfilePatch = Partial<Omit<Profile, 'id' | 'created' | 'updated'>>

export function updateProfile(id: string, patch: ProfilePatch): Profile {
  const current = requireProfile(id)
  const next: Profile = { ...current, ...patch, id, created: current.created, updated: Date.now() }

  statement(`
    UPDATE profiles SET name = ?, icon = ?, game_version = ?, loader_kind = ?, loader_ver = ?,
                        version_id = ?, account_id = ?, java_json = ?, memory_json = ?, window_json = ?,
                        jvm_args = ?, game_args = ?, offline_skins = ?, updated = ?, last_played = ?
    WHERE id = ?
  `).run(
    next.name,
    next.icon ?? null,
    next.gameVersion,
    next.loader.kind,
    next.loader.version ?? null,
    next.resolvedVersionId ?? null,
    next.accountId ?? null,
    JSON.stringify(next.java),
    JSON.stringify(next.memory),
    next.window ? JSON.stringify(next.window) : null,
    JSON.stringify(next.jvmArgs),
    JSON.stringify(next.gameArgs),
    next.offlineSkins ? 1 : 0,
    next.updated,
    next.lastPlayed ?? null,
    id
  )

  return next
}

export function touchProfile(id: string): void {
  statement('UPDATE profiles SET last_played = ?, updated = ? WHERE id = ?').run(
    Date.now(),
    Date.now(),
    id
  )
}

export function deleteProfile(id: string): void {
  transaction(() => statement('DELETE FROM profiles WHERE id = ?').run(id))
}

export function duplicateProfile(id: string): Profile {
  const source = requireProfile(id)
  return createProfile({
    name: `${source.name} (копия)`,
    gameVersion: source.gameVersion,
    loader: source.loader,
    ...(source.icon ? { icon: source.icon } : {}),
    ...(source.accountId ? { accountId: source.accountId } : {}),
    java: source.java,
    memory: source.memory,
    ...(source.window ? { window: source.window } : {}),
    jvmArgs: [...source.jvmArgs],
    gameArgs: [...source.gameArgs],
    offlineSkins: source.offlineSkins
  })
}

export function profileCount(): number {
  const row = statement('SELECT COUNT(*) AS total FROM profiles').get() as { total: number } | undefined
  return Number(row?.total ?? 0)
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    ...(row.icon ? { icon: row.icon } : {}),
    gameVersion: row.game_version,
    loader: {
      kind: asLoaderKind(row.loader_kind),
      ...(row.loader_ver ? { version: row.loader_ver } : {})
    },
    ...(row.version_id ? { resolvedVersionId: row.version_id } : {}),
    ...(row.account_id ? { accountId: row.account_id } : {}),
    java: parseJson<Profile['java']>(row.java_json, { mode: 'auto' }),
    memory: normalizeMemory(parseJson(row.memory_json, { auto: true, minMb: 2048, maxMb: 4096 })),
    ...(row.window_json ? { window: parseJson<NonNullable<Profile['window']>>(row.window_json, {
      width: 1280,
      height: 720,
      fullscreen: false
    }) } : {}),
    jvmArgs: parseJson<string[]>(row.jvm_args, []),
    gameArgs: parseJson<string[]>(row.game_args, []),
    offlineSkins: row.offline_skins === 1,
    created: row.created,
    updated: row.updated,
    ...(row.last_played ? { lastPlayed: row.last_played } : {})
  }
}

function asLoaderKind(value: string): LoaderKind {
  const known: LoaderKind[] = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']
  return known.find((kind) => kind === value) ?? 'vanilla'
}

function normalizeMemory(memory: Profile['memory']): Profile['memory'] {
  const maxMb = Math.min(Math.max(memory.maxMb, MEMORY.minMb), MEMORY.maxMb)
  const minMb = Math.min(Math.max(memory.minMb, MEMORY.minMb), maxMb)
  return { auto: memory.auto, minMb, maxMb }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
