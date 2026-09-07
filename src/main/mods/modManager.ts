import { win32 as path } from 'node:path'
import { rename } from 'node:fs/promises'
import type { ContentKind, LoaderKind, ModEntry, ModPreviousVersion, ModVersionInfo, Profile } from '@shared/types'
import { RayError } from '@shared/errors'
import { enqueueBatch } from '../downloads/manager'
import { ensureDir, pathExists, removePath } from '../core/fsx'
import { instanceSubdir } from '../core/paths'
import { sha1File } from '../core/hash'
import { logger } from '../logger'
import {
  deleteMod,
  findMod,
  findModByProject,
  listMods,
  setModEnabled,
  setModPinned,
  upsertMod,
  type UpsertModInput
} from '../db/mods.repo'
import { requireProfile } from '../db/profiles.repo'
import * as modrinth from './modrinth'
import * as curseforge from './curseforge'
import { pickBestVersion, resolveInstall, type VersionSource } from './resolver'

const DISABLED_SUFFIX = '.disabled'

export function modsDir(profileId: string): string {
  return instanceSubdir(profileId, 'mods')
}

export function contentDir(profileId: string, kind: ContentKind): string {
  switch (kind) {
    case 'resourcepack':
      return instanceSubdir(profileId, 'resourcepacks')
    case 'shader':
      return instanceSubdir(profileId, 'shaderpacks')
    default:
      return instanceSubdir(profileId, 'mods')
  }
}

export function versionSourceFor(profile: Profile): VersionSource {
  const loader = profile.loader.kind

  return {
    async bestVersion(projectId) {
      const versions = await modrinth.fetchVersions(projectId, {
        gameVersion: profile.gameVersion,
        loader
      })
      return pickBestVersion(versions, profile.gameVersion, loader)
    },
    async versionById(versionId) {
      return modrinth.fetchVersion(versionId).catch(() => null)
    },
    async projectTitle(projectId) {
      const project = await modrinth.fetchProject(projectId).catch(() => null)
      return project?.title ?? projectId
    }
  }
}

export async function planInstall(
  profileId: string,
  version: ModVersionInfo
): Promise<Awaited<ReturnType<typeof resolveInstall>>> {
  const profile = requireProfile(profileId)
  const kind = version.contentKind ?? 'mod'

  // Пакетам ресурсов и шейдерам загрузчик не нужен, зависимостей у них нет.
  if (kind !== 'mod') {
    return { primary: version, dependencies: [], incompatible: [], missing: [] }
  }

  assertLoader(profile.loader.kind)

  const installed = listMods(profileId).map((mod) => mod.projectId)
  return resolveInstall(version, versionSourceFor(profile), { installedProjectIds: installed })
}

export async function installMod(
  profileId: string,
  version: ModVersionInfo,
  options: { withDependencies?: boolean } = {}
): Promise<ModEntry[]> {
  const profile = requireProfile(profileId)
  const kind = version.contentKind ?? 'mod'
  if (kind === 'mod') assertLoader(profile.loader.kind)

  const plan = await planInstall(profileId, version)
  if (plan.incompatible.length > 0) {
    throw new RayError(
      'MOD_INCOMPATIBLE',
      `Мод конфликтует с уже установленным: ${plan.incompatible.join(', ')}`,
      { incompatible: plan.incompatible }
    )
  }

  const targets = options.withDependencies === false ? [version] : [version, ...plan.dependencies]
  const directory = contentDir(profileId, kind)
  await ensureDir(directory)

  const handle = enqueueBatch(
    targets.map((item) => ({
      kind: 'mod' as const,
      url: item.downloadUrl,
      dest: path.join(directory, item.fileName),
      ...(item.sha1 ? { sha1: item.sha1 } : {}),
      size: item.size,
      label: item.fileName,
      profileId
    }))
  )
  await handle.promise

  const entries = targets.map((item) =>
    upsertMod(toEntryInput(profileId, item, path.join(directory, item.fileName), kind))
  )

  logger.info(`В профиль ${profile.name} установлено файлов: ${entries.length}`)
  return entries
}

function toEntryInput(
  profileId: string,
  version: ModVersionInfo,
  filePath: string,
  kind: ContentKind,
  previous?: ModPreviousVersion
): UpsertModInput {
  return {
    profileId,
    source: version.source,
    kind,
    projectId: version.projectId,
    versionId: version.versionId,
    title: version.title,
    slug: version.projectId,
    ...(version.iconUrl ? { iconUrl: version.iconUrl } : {}),
    fileName: version.fileName,
    filePath,
    sha1: version.sha1,
    ...(version.sha512 ? { sha512: version.sha512 } : {}),
    size: version.size,
    enabled: true,
    pinned: false,
    ...(previous ? { previous } : {})
  }
}

export async function removeMod(modId: string): Promise<void> {
  const mod = findMod(modId)
  if (!mod) return

  await removePath(mod.filePath)
  deleteMod(modId)
  logger.info(`Мод «${mod.title}» удалён`)
}

export async function toggleMod(modId: string, enabled: boolean): Promise<ModEntry> {
  const mod = findMod(modId)
  if (!mod) throw new RayError('INVALID_INPUT', 'Мод не найден', { modId })
  if (mod.enabled === enabled) return mod

  const directory = path.dirname(mod.filePath)
  const baseName = mod.fileName.endsWith(DISABLED_SUFFIX)
    ? mod.fileName.slice(0, -DISABLED_SUFFIX.length)
    : mod.fileName

  const nextName = enabled ? baseName : `${baseName}${DISABLED_SUFFIX}`
  const nextPath = path.join(directory, nextName)

  if (await pathExists(mod.filePath)) {
    await rename(mod.filePath, nextPath)
  }

  setModEnabled(modId, enabled, nextPath, nextName)
  return { ...mod, enabled, filePath: nextPath, fileName: nextName }
}

export async function pinMod(modId: string, pinned: boolean): Promise<ModEntry> {
  const mod = findMod(modId)
  if (!mod) throw new RayError('INVALID_INPUT', 'Мод не найден', { modId })
  setModPinned(modId, pinned)
  return { ...mod, pinned }
}

export async function updateMod(modId: string, version: ModVersionInfo): Promise<ModEntry> {
  const mod = findMod(modId)
  if (!mod) throw new RayError('INVALID_INPUT', 'Мод не найден', { modId })

  const directory = contentDir(mod.profileId, mod.kind)
  await ensureDir(directory)

  const previous = await previousOf(mod).catch(() => null)

  const dest = path.join(directory, version.fileName)
  const handle = enqueueBatch([
    {
      kind: 'mod',
      url: version.downloadUrl,
      dest,
      ...(version.sha1 ? { sha1: version.sha1 } : {}),
      size: version.size,
      label: version.fileName,
      profileId: mod.profileId
    }
  ])
  await handle.promise

  if (mod.filePath !== dest) await removePath(mod.filePath)

  deleteMod(modId)
  const entry = upsertMod({
    ...toEntryInput(mod.profileId, version, dest, mod.kind),
    ...(previous ? { previous } : {})
  })
  logger.info(`Мод «${mod.title}» обновлён до ${version.versionNumber}`)

  return entry
}

/** Откат к версии, стоявшей до последнего обновления. */
export async function rollbackMod(modId: string): Promise<ModEntry> {
  const mod = findMod(modId)
  if (!mod) throw new RayError('INVALID_INPUT', 'Мод не найден', { modId })
  if (!mod.previous) {
    throw new RayError('INVALID_INPUT', 'Для этого мода нет сохранённой прошлой версии', { modId })
  }

  const previous = mod.previous
  const directory = contentDir(mod.profileId, mod.kind)
  await ensureDir(directory)

  const dest = path.join(directory, previous.fileName)
  const handle = enqueueBatch([
    {
      kind: 'mod',
      url: previous.downloadUrl,
      dest,
      ...(previous.sha1 ? { sha1: previous.sha1 } : {}),
      size: previous.size,
      label: previous.fileName,
      profileId: mod.profileId
    }
  ])
  await handle.promise

  if (mod.filePath !== dest) await removePath(mod.filePath)

  deleteMod(modId)
  const entry = upsertMod({
    ...toEntryInput(
      mod.profileId,
      {
        source: mod.source,
        contentKind: mod.kind,
        versionId: previous.versionId,
        projectId: mod.projectId,
        title: mod.title,
        versionNumber: previous.versionNumber,
        gameVersions: [],
        loaders: [],
        releaseType: 'release',
        datePublished: '',
        downloadUrl: previous.downloadUrl,
        fileName: previous.fileName,
        size: previous.size,
        sha1: previous.sha1,
        dependencies: []
      },
      dest,
      mod.kind
    )
  })
  logger.info(`Мод «${mod.title}» откачен к ${previous.versionNumber || previous.fileName}`)
  return entry
}

/** Перекачивание того же файла — лечит битые jar после краша. */
export async function reinstallMod(modId: string): Promise<ModEntry> {
  const mod = findMod(modId)
  if (!mod) throw new RayError('INVALID_INPUT', 'Мод не найден', { modId })
  if (mod.source === 'local' || mod.versionId.length === 0) {
    throw new RayError('INVALID_INPUT', 'Мод добавлен вручную — переустановить можно только файлом', {
      modId
    })
  }

  const version =
    mod.source === 'curseforge'
      ? await curseforge.fetchVersion(mod.projectId, mod.versionId)
      : await modrinth.fetchVersion(mod.versionId)

  const directory = contentDir(mod.profileId, mod.kind)
  await ensureDir(directory)

  const dest = path.join(directory, version.fileName)
  const handle = enqueueBatch([
    {
      kind: 'mod',
      url: version.downloadUrl,
      dest,
      ...(version.sha1 ? { sha1: version.sha1 } : {}),
      size: version.size,
      label: version.fileName,
      profileId: mod.profileId
    }
  ])
  await handle.promise

  if (mod.filePath !== dest) await removePath(mod.filePath)

  deleteMod(modId)
  const entry = upsertMod(toEntryInput(mod.profileId, version, dest, mod.kind))
  logger.info(`Мод «${mod.title}» переустановлен`)
  return entry
}

async function previousOf(mod: ModEntry): Promise<ModPreviousVersion | null> {
  if (mod.source === 'local' || mod.versionId.length === 0) return null

  const version =
    mod.source === 'curseforge'
      ? await curseforge.fetchVersion(mod.projectId, mod.versionId).catch(() => null)
      : await modrinth.fetchVersion(mod.versionId).catch(() => null)

  if (!version) return null
  return {
    versionId: version.versionId,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    downloadUrl: version.downloadUrl,
    sha1: version.sha1,
    size: version.size
  }
}

export function installedProjectIds(profileId: string): Set<string> {
  return new Set(listMods(profileId).map((mod) => mod.projectId))
}

export function isInstalled(profileId: string, source: ModEntry['source'], projectId: string): boolean {
  return findModByProject(profileId, source, projectId) !== null
}

export async function verifyMod(mod: ModEntry): Promise<boolean> {
  if (!(await pathExists(mod.filePath))) return false
  if (mod.sha1.length === 0) return true

  const actual = await sha1File(mod.filePath)
  return actual.toLowerCase() === mod.sha1.toLowerCase()
}

export async function fetchVersionsFor(
  source: ModEntry['source'],
  projectId: string,
  profile: Profile,
  kind: ContentKind = 'mod'
): Promise<ModVersionInfo[]> {
  // У ресурспаков и шейдеров привязки к загрузчику нет — фильтруем только по версии игры.
  const filter = kind === 'mod' ? { gameVersion: profile.gameVersion, loader: profile.loader.kind } : { gameVersion: profile.gameVersion }

  const versions =
    source === 'curseforge'
      ? await curseforge.fetchVersions(projectId, filter)
      : await modrinth.fetchVersions(projectId, filter)

  return versions.map((version) => ({ ...version, contentKind: kind }))
}

function assertLoader(kind: LoaderKind): void {
  if (kind === 'vanilla') {
    throw new RayError(
      'MOD_INCOMPATIBLE',
      'В ванильный профиль моды не ставятся — выберите Fabric, Forge, NeoForge или Quilt'
    )
  }
}
