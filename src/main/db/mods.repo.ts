import { randomUUID } from 'node:crypto'
import type { ModEntry, ModSource } from '@shared/types'
import { statement, transaction } from './database'

interface ModRow {
  id: string
  profile_id: string
  source: string
  project_id: string
  version_id: string
  title: string
  slug: string
  icon_url: string | null
  file_name: string
  file_path: string
  sha1: string
  sha512: string | null
  size: number
  enabled: number
  installed_at: number
}

const SELECT = `
  SELECT id, profile_id, source, project_id, version_id, title, slug, icon_url,
         file_name, file_path, sha1, sha512, size, enabled, installed_at
  FROM mods
`

export function listMods(profileId: string): ModEntry[] {
  const rows = statement(`${SELECT} WHERE profile_id = ? ORDER BY title COLLATE NOCASE`).all(
    profileId
  ) as unknown as ModRow[]
  return rows.map(toEntry)
}

export function findMod(id: string): ModEntry | null {
  const row = statement(`${SELECT} WHERE id = ?`).get(id) as unknown as ModRow | undefined
  return row ? toEntry(row) : null
}

export function findModByProject(profileId: string, source: ModSource, projectId: string): ModEntry | null {
  const row = statement(`${SELECT} WHERE profile_id = ? AND source = ? AND project_id = ?`).get(
    profileId,
    source,
    projectId
  ) as ModRow | undefined
  return row ? toEntry(row) : null
}

export function findModByFile(profileId: string, fileName: string): ModEntry | null {
  const row = statement(`${SELECT} WHERE profile_id = ? AND file_name = ?`).get(profileId, fileName) as unknown as
    | ModRow
    | undefined
  return row ? toEntry(row) : null
}

export type UpsertModInput = Omit<ModEntry, 'id' | 'installedAt'> & { installedAt?: number }

export function upsertMod(input: UpsertModInput): ModEntry {
  const existing = findModByFile(input.profileId, input.fileName)
  const entry: ModEntry = {
    id: existing?.id ?? `m-${randomUUID().slice(0, 8)}`,
    installedAt: input.installedAt ?? Date.now(),
    ...input
  }

  statement(`
    INSERT INTO mods (id, profile_id, source, project_id, version_id, title, slug, icon_url,
                      file_name, file_path, sha1, sha512, size, enabled, installed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(profile_id, file_name) DO UPDATE SET
      source = excluded.source,
      project_id = excluded.project_id,
      version_id = excluded.version_id,
      title = excluded.title,
      slug = excluded.slug,
      icon_url = excluded.icon_url,
      file_path = excluded.file_path,
      sha1 = excluded.sha1,
      sha512 = excluded.sha512,
      size = excluded.size,
      enabled = excluded.enabled,
      installed_at = excluded.installed_at
  `).run(
    entry.id,
    entry.profileId,
    entry.source,
    entry.projectId,
    entry.versionId,
    entry.title,
    entry.slug,
    entry.iconUrl ?? null,
    entry.fileName,
    entry.filePath,
    entry.sha1,
    entry.sha512 ?? null,
    entry.size,
    entry.enabled ? 1 : 0,
    entry.installedAt
  )

  return entry
}

export function setModEnabled(id: string, enabled: boolean, filePath: string, fileName: string): void {
  statement('UPDATE mods SET enabled = ?, file_path = ?, file_name = ? WHERE id = ?').run(
    enabled ? 1 : 0,
    filePath,
    fileName,
    id
  )
}

export function deleteMod(id: string): void {
  statement('DELETE FROM mods WHERE id = ?').run(id)
}

export function deleteModsOfProfile(profileId: string): void {
  transaction(() => statement('DELETE FROM mods WHERE profile_id = ?').run(profileId))
}

export function upsertMany(inputs: readonly UpsertModInput[]): ModEntry[] {
  return transaction(() => inputs.map(upsertMod))
}

export function modCount(profileId: string): number {
  const row = statement('SELECT COUNT(*) AS total FROM mods WHERE profile_id = ?').get(profileId) as
    | { total: number }
    | undefined
  return Number(row?.total ?? 0)
}

function toEntry(row: ModRow): ModEntry {
  return {
    id: row.id,
    profileId: row.profile_id,
    source: row.source === 'curseforge' ? 'curseforge' : row.source === 'local' ? 'local' : 'modrinth',
    projectId: row.project_id,
    versionId: row.version_id,
    title: row.title,
    slug: row.slug,
    ...(row.icon_url ? { iconUrl: row.icon_url } : {}),
    fileName: row.file_name,
    filePath: row.file_path,
    sha1: row.sha1,
    ...(row.sha512 ? { sha512: row.sha512 } : {}),
    size: row.size,
    enabled: row.enabled === 1,
    installedAt: row.installed_at
  }
}
