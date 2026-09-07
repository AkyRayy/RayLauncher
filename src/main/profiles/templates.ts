import type { LoaderKind, Profile, ProfileTemplate } from '@shared/types'
import { RayError } from '@shared/errors'
import { createProfile } from '../db/profiles.repo'
import { loadManifest } from '../minecraft/manifest'
import { listLoaderVersions } from '../loaders'
import { jvmFlagsFor } from '../perf/presets'
import { installBoost } from '../perf/presets'
import { prepareInstance } from './profileService'
import { emitEvent } from '../core/events'
import { listProfiles } from '../db/profiles.repo'
import { logger } from '../logger'

const TEMPLATES: readonly ProfileTemplate[] = [
  { id: 'vanilla', loader: 'vanilla', boost: false },
  { id: 'fabric-perf', loader: 'fabric', memoryMb: 4096, jvmPreset: 'balanced', boost: true },
  { id: 'forge-empty', loader: 'forge', boost: false },
  { id: 'neoforge-empty', loader: 'neoforge', boost: false }
]

export function listTemplates(): ProfileTemplate[] {
  return [...TEMPLATES]
}

/** Создаёт профиль из шаблона на свежем релизе Minecraft. Буст ставится best-effort. */
export async function createFromTemplate(templateId: string, name?: string): Promise<Profile> {
  const template = TEMPLATES.find((item) => item.id === templateId)
  if (!template) throw new RayError('INVALID_INPUT', 'Шаблон не найден', { templateId })

  const { manifest } = await loadManifest()
  const gameVersion = manifest.latest.release
  const loader = await resolveLoader(template.loader, gameVersion)

  const profile = createProfile({
    name: name?.trim() || defaultName(template.loader, gameVersion),
    gameVersion,
    loader,
    ...(template.memoryMb
      ? { memory: { auto: false, minMb: Math.floor(template.memoryMb / 2), maxMb: template.memoryMb } }
      : {}),
    ...(template.jvmPreset ? { jvmArgs: jvmFlagsFor(template.jvmPreset) } : {})
  })
  await prepareInstance(profile.id)

  if (template.boost) {
    await installBoost(profile.id).catch((error: unknown) => {
      logger.warn(`Буст для «${profile.name}» не поставился: ${error instanceof Error ? error.message : String(error)}`)
    })
  }

  emitEvent('profiles:changed', listProfiles())
  logger.info(`Профиль «${profile.name}» создан из шаблона ${templateId}`)
  return profile
}

async function resolveLoader(
  kind: LoaderKind,
  gameVersion: string
): Promise<{ kind: LoaderKind; version?: string }> {
  if (kind === 'vanilla') return { kind }

  const versions = await listLoaderVersions(kind, gameVersion)
  const recommended = versions.find((item) => item.recommended) ?? versions.find((item) => item.stable) ?? versions[0]
  if (!recommended) {
    throw new RayError('LOADER_NO_VERSION', `Нет ${kind} под Minecraft ${gameVersion}`, { kind, gameVersion })
  }
  return { kind, version: recommended.id }
}

function defaultName(loader: LoaderKind, gameVersion: string): string {
  const label: Record<LoaderKind, string> = {
    vanilla: 'Ванильная',
    fabric: 'Fabric + буст',
    forge: 'Forge',
    neoforge: 'NeoForge',
    quilt: 'Quilt'
  }
  return `${label[loader]} ${gameVersion}`
}
