import { dialog, shell } from 'electron'
import type { ModEntry, ModSearchResult, ModVersionInfo } from '@shared/types'
import { handle } from './registry'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import { listProfiles, requireProfile } from '../db/profiles.repo'
import { findMod, listMods } from '../db/mods.repo'
import * as modrinth from '../mods/modrinth'
import * as curseforge from '../mods/curseforge'
import {
  fetchVersionsFor,
  installMod,
  installedProjectIds,
  modsDir,
  planInstall,
  removeMod,
  toggleMod,
  updateMod
} from '../mods/modManager'
import { findUpdates, scanLocalMods } from '../mods/updates'
import { importModpack } from '../mods/packs'

export function registerModsIpc(): void {

  handle('mods:search', async (input): Promise<ModSearchResult> => {
    const profile = input.profileId ? requireProfile(input.profileId) : null
    const gameVersion = input.gameVersion ?? profile?.gameVersion
    const loader = input.loader ?? profile?.loader.kind

    const result =
      input.source === 'curseforge'
        ? await curseforge.searchMods({
            query: input.query,
            ...(gameVersion ? { gameVersion } : {}),
            ...(loader ? { loader } : {}),
            offset: input.offset ?? 0,
            limit: input.limit ?? 20
          })
        : await modrinth.searchMods({
            query: input.query,
            ...(gameVersion ? { gameVersion } : {}),
            ...(loader ? { loader } : {}),
            offset: input.offset ?? 0,
            limit: input.limit ?? 20,
            ...(input.sort ? { index: input.sort } : {})
          })

    if (!profile) return result
    const installed = installedProjectIds(profile.id)

    return {
      ...result,
      hits: result.hits.map((hit) => ({ ...hit, installed: installed.has(hit.projectId) }))
    }
  })

  handle('mods:project', async ({ source, projectId }) => {
    if (source === 'curseforge') {
      return { title: await curseforge.fetchProjectTitle(projectId), body: '', links: {} }
    }

    const project = await modrinth.fetchProject(projectId)
    return {
      title: project.title,
      body: project.body,
      links: {
        ...(project.source_url ? { source: project.source_url } : {}),
        ...(project.issues_url ? { issues: project.issues_url } : {}),
        ...(project.wiki_url ? { wiki: project.wiki_url } : {})
      }
    }
  })

  handle('mods:versions', async ({ source, projectId, profileId }) => {
    const profile = requireProfile(profileId)
    return fetchVersionsFor(source, projectId, profile)
  })

  handle('mods:plan', async ({ profileId, version }) => {
    const plan = await planInstall(profileId, version as ModVersionInfo)
    return {
      dependencies: plan.dependencies,
      incompatible: plan.incompatible,
      missing: plan.missing
    }
  })

  handle('mods:install', async ({ profileId, version, withDependencies }) => {
    const entries = await installMod(profileId, version as ModVersionInfo, {
      withDependencies: withDependencies !== false
    })
    broadcast(profileId)
    return entries
  })

  handle('mods:remove', async ({ modId }) => {
    const mod = findMod(modId)
    await removeMod(modId)
    if (mod) broadcast(mod.profileId)
  })

  handle('mods:toggle', async ({ modId, enabled }) => {
    const entry = await toggleMod(modId, enabled)
    broadcast(entry.profileId)
    return entry
  })

  handle('mods:update', async ({ modId, version }) => {
    const entry = await updateMod(modId, version as ModVersionInfo)
    broadcast(entry.profileId)
    return entry
  })

  handle('mods:list', ({ profileId }): ModEntry[] => listMods(profileId))

  handle('mods:scan', async ({ profileId }) => {
    const added = await scanLocalMods(profileId)
    if (added.length > 0) broadcast(profileId)
    return added
  })

  handle('mods:updates', async ({ profileId }) => {
    const profile = requireProfile(profileId)
    return findUpdates(profile)
  })

  handle('mods:updateAll', async ({ profileId }) => {
    const profile = requireProfile(profileId)
    const updates = await findUpdates(profile)

    let updated = 0
    for (const item of updates) {
      try {
        await updateMod(item.modId, item.next)
        updated += 1
      } catch (error) {
        logger.warn(
          `Мод «${item.title}» не обновился: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    broadcast(profileId)
    return { updated, total: updates.length }
  })

  handle('mods:openFolder', async ({ profileId }) => {
    await shell.openPath(modsDir(profileId))
  })

  handle('mods:importPack', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'Выберите модпак',
      filters: [{ name: 'Модпак', extensions: ['mrpack', 'zip'] }],
      properties: ['openFile']
    })

    const file = picked.filePaths[0]
    if (picked.canceled || !file) return null

    const result = await importModpack(file)
    emitEvent('profiles:changed', listProfiles())
    return {
      profileId: result.profile.id,
      name: result.profile.name,
      modsInstalled: result.modsInstalled,
      filesSkipped: result.filesSkipped
    }
  })

  handle('mods:setCurseforgeKey', async ({ key }) => {
    await curseforge.setCurseforgeKey(key)
  })

  handle('mods:curseforgeReady', () => curseforge.isCurseforgeReady())
}

function broadcast(profileId: string): void {
  emitEvent('mods:changed', { profileId, mods: listMods(profileId) })
}
