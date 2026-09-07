import { totalmem } from 'node:os'
import { PERF } from '@shared/constants'
import { RayError } from '@shared/errors'
import { clamp } from '@shared/util'
import type { BoostResult, LoaderKind, PerfPreset, PerfPresetId, Profile } from '@shared/types'
import { requireProfile, updateProfile } from '../db/profiles.repo'
import { installedProjectIds } from '../mods/modManager'
import { installMod } from '../mods/modManager'
import { fetchProject, fetchVersions } from '../mods/modrinth'
import { pickBestVersion } from '../mods/resolver'
import { logger } from '../logger'

/** Консервативные флаги GC: без экспериментальных опций, работают на Java 17/21. */
const FLAGS: Record<PerfPresetId, string[]> = {
  low: ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=120', '-XX:G1HeapRegionSize=16M'],
  balanced: ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50'],
  high: [
    '-XX:+UseG1GC',
    '-XX:MaxGCPauseMillis=200',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=32M',
    '-XX:+UseStringDeduplication'
  ]
}

export function memoryForPreset(totalMb: number, preset: PerfPresetId): number {
  switch (preset) {
    case 'low':
      return totalMb <= 4096 ? 1536 : PERF.lowMemoryMb
    case 'balanced':
      return clamp(Math.floor(totalMb / 4 / 512) * 512, 2048, 4096)
    case 'high':
      return clamp(Math.floor(totalMb / 2 / 512) * 512, 4096, PERF.highMemoryCapMb)
  }
}

export function jvmFlagsFor(preset: PerfPresetId): string[] {
  return [...FLAGS[preset]]
}

export function listPresets(): PerfPreset[] {
  const totalMb = Math.floor(totalmem() / (1024 * 1024))
  const ids: PerfPresetId[] = ['low', 'balanced', 'high']
  return ids.map((id) => ({ id, memoryMb: memoryForPreset(totalMb, id), jvmArgs: jvmFlagsFor(id) }))
}

export function applyPreset(profileId: string, preset: PerfPresetId): Profile {
  const found = listPresets().find((item) => item.id === preset)
  if (!found) throw new RayError('INVALID_INPUT', 'Неизвестный пресет производительности', { preset })

  const profile = updateProfile(profileId, {
    memory: { auto: false, minMb: Math.max(1024, Math.floor(found.memoryMb / 2)), maxMb: found.memoryMb },
    jvmArgs: found.jvmArgs
  })
  logger.info(`Профиль «${profile.name}»: применён пресет ${preset} (${found.memoryMb} МБ)`)
  return profile
}

const BOOST_LOADER = new Set<LoaderKind>(['fabric', 'quilt', 'forge', 'neoforge'])

/** Ставит Sodium/Iris (или аналоги) под загрузчик профиля. Пропускает уже установленное. */
export async function installBoost(profileId: string): Promise<BoostResult> {
  const profile = requireProfile(profileId)
  if (!BOOST_LOADER.has(profile.loader.kind)) {
    throw new RayError(
      'MOD_INCOMPATIBLE',
      'Буст ставится только в профиль с Fabric, Quilt, Forge или NeoForge'
    )
  }

  const slugs = PERF.boost[profile.loader.kind as keyof typeof PERF.boost] ?? []
  const installed = installedProjectIds(profileId)

  const result: BoostResult = { installed: [], skipped: [] }

  for (const slug of slugs) {
    try {
      const project = await fetchProject(slug)
      if (installed.has(project.id)) {
        result.skipped.push(project.title)
        continue
      }

      const versions = await fetchVersions(project.id, {
        gameVersion: profile.gameVersion,
        loader: profile.loader.kind
      })
      const best = pickBestVersion(versions, profile.gameVersion, profile.loader.kind)
      if (!best) {
        logger.warn(`Буст: для ${project.title} нет версии под ${profile.gameVersion}`)
        result.skipped.push(project.title)
        continue
      }

      await installMod(profileId, { ...best, contentKind: 'mod' }, { withDependencies: true })
      installed.add(project.id)
      result.installed.push(project.title)
    } catch (error) {
      logger.warn(`Буст: ${slug} не поставился: ${error instanceof Error ? error.message : String(error)}`)
      result.skipped.push(slug)
    }
  }

  logger.info(`Буст профиля «${profile.name}»: +${result.installed.length}, пропущено ${result.skipped.length}`)
  return result
}
