import { readdir } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import type { ModEntry, ModUpdateInfo, Profile } from '@shared/types'
import { pathExists } from '../core/fsx'
import { sha1File } from '../core/hash'
import { logger } from '../logger'
import { listMods, upsertMod } from '../db/mods.repo'
import { latestForHashes, lookupByHashes } from './modrinth'
import { modsDir } from './modManager'

export async function findUpdates(profile: Profile): Promise<ModUpdateInfo[]> {
  const mods = listMods(profile.id).filter((mod) => mod.source === 'modrinth' && mod.sha1.length > 0)
  if (mods.length === 0 || profile.loader.kind === 'vanilla') return []

  const latest = await latestForHashes(
    mods.map((mod) => mod.sha1),
    profile.gameVersion,
    profile.loader.kind
  )

  const updates: ModUpdateInfo[] = []
  for (const mod of mods) {
    const next = latest.get(mod.sha1.toLowerCase()) ?? latest.get(mod.sha1)
    if (!next || next.versionId === mod.versionId) continue

    updates.push({
      modId: mod.id,
      title: mod.title,
      currentVersion: mod.versionId,
      next
    })
  }

  logger.info(`Обновлений для профиля ${profile.name}: ${updates.length}`)
  return updates
}

export async function scanLocalMods(profileId: string): Promise<ModEntry[]> {
  const directory = modsDir(profileId)
  if (!(await pathExists(directory))) return []

  const known = new Map(listMods(profileId).map((mod) => [mod.fileName.toLowerCase(), mod]))
  const entries = await readdir(directory, { withFileTypes: true })

  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.jar(\.disabled)?$/i.test(name))
    .filter((name) => !known.has(name.toLowerCase()))

  if (candidates.length === 0) return []

  const hashes = new Map<string, string>()
  for (const name of candidates) {
    hashes.set(name, await sha1File(path.join(directory, name)))
  }

  const identified = await lookupByHashes([...hashes.values()]).catch(() => new Map())
  const added: ModEntry[] = []

  for (const name of candidates) {
    const sha1 = hashes.get(name) ?? ''
    const match = identified.get(sha1)
    const enabled = !name.endsWith('.disabled')

    added.push(
      upsertMod({
        profileId,
        source: match ? 'modrinth' : 'local',
        projectId: match?.projectId ?? sha1.slice(0, 12),
        versionId: match?.versionId ?? '',
        title: match?.title ?? name.replace(/\.jar(\.disabled)?$/i, ''),
        slug: match?.projectId ?? '',
        fileName: name,
        filePath: path.join(directory, name),
        sha1,
        size: 0,
        enabled
      })
    )
  }

  logger.info(`Опознано модов в папке профиля: ${added.length}`)
  return added
}
