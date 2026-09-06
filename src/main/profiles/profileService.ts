import { win32 as path } from 'node:path'
import type { InstallStage, Profile } from '@shared/types'
import { MEMORY } from '@shared/constants'
import { RayError } from '@shared/errors'
import { clamp } from '@shared/util'
import { ensureDir, pathExists, removePath } from '../core/fsx'
import { instanceDir, instanceSubdir, versionJsonPath } from '../core/paths'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import { installVersion, type InstallResult } from '../minecraft/installer'
import { installLoader, loaderLabel } from '../loaders'
import { launchGame, type LaunchRequest } from '../minecraft/launcher'
import { deleteProfile, requireProfile, touchProfile, updateProfile } from '../db/profiles.repo'
import { deleteModsOfProfile } from '../db/mods.repo'
import { getActiveAccount, getAccount } from '../auth/accountManager'
import { ensureFreshAccount } from '../auth/tokenRefresher'
import { createGuestAccount } from '../auth/offline'
import { getSettings } from '../store/settings.store'
import { totalmem } from 'node:os'

const INSTANCE_DIRS = ['mods', 'saves', 'config', 'logs', 'crash-reports', 'resourcepacks', 'shaderpacks'] as const

export async function prepareInstance(profileId: string): Promise<string> {
  const root = instanceDir(profileId)
  await ensureDir(root)
  for (const sub of INSTANCE_DIRS) await ensureDir(path.join(root, sub))
  return root
}

export async function installProfile(profileId: string, verify = false): Promise<InstallResult> {
  const profile = requireProfile(profileId)
  await prepareInstance(profileId)

  const versionId = await ensureLoaderInstalled(profile)
  return installVersion(versionId, { profileId, verify })
}

export async function ensureLoaderInstalled(profile: Profile): Promise<string> {
  if (profile.loader.kind === 'vanilla') return profile.gameVersion

  const known = profile.resolvedVersionId
  if (known && (await pathExists(versionJsonPath(known)))) return known

  if (!profile.loader.version) {
    throw new RayError(
      'LOADER_NO_VERSION',
      `Для профиля не выбрана версия ${loaderLabel(profile.loader.kind)}`,
      { profileId: profile.id }
    )
  }

  emitStage(profile, 'Устанавливаю загрузчик модов')
  const versionId = await installLoader(profile.loader.kind, profile.gameVersion, profile.loader.version)

  updateProfile(profile.id, { resolvedVersionId: versionId })
  return versionId
}

export async function launchProfile(profileId: string): Promise<ReturnType<typeof launchGame>> {
  const profile = requireProfile(profileId)
  await prepareInstance(profileId)

  const versionId = await ensureLoaderInstalled(profile)
  const account = await accountForProfile(profile)
  const memory = memoryFor(profile)

  logger.info(
    `Запуск профиля «${profile.name}» (${versionId}), память ${memory.minMb}–${memory.maxMb} МБ`
  )

  const request: LaunchRequest = {
    profileId: profile.id,
    versionId,
    account,
    memoryMinMb: memory.minMb,
    memoryMaxMb: memory.maxMb,
    jvmArgs: profile.jvmArgs,
    gameArgs: profile.gameArgs,
    ...(profile.window ? { window: profile.window } : {}),
    ...(profile.java.mode === 'custom' && profile.java.customPath
      ? { javaPath: profile.java.customPath }
      : {})
  }

  touchProfile(profile.id)
  return launchGame(request)
}

async function accountForProfile(profile: Profile): Promise<LaunchRequest['account']> {
  const own = profile.accountId ? await getAccount(profile.accountId) : null
  const chosen = own ?? (await getActiveAccount())

  if (!chosen) return createGuestAccount(getSettings().guestNickname)
  return ensureFreshAccount(chosen.id)
}

export function memoryFor(profile: Profile): { minMb: number; maxMb: number } {
  if (!profile.memory.auto) {
    const maxMb = clamp(profile.memory.maxMb, MEMORY.minMb, MEMORY.maxMb)
    return { minMb: clamp(profile.memory.minMb, MEMORY.minMb, maxMb), maxMb }
  }

  const total = Math.floor(totalmem() / (1024 * 1024))
  const maxMb = clamp(Math.round(total / 4 / 512) * 512, 2048, 8192)
  return { minMb: Math.max(MEMORY.minMb, Math.floor(maxMb / 2)), maxMb }
}

export async function removeProfile(profileId: string, deleteFiles: boolean): Promise<void> {
  const profile = requireProfile(profileId)

  deleteModsOfProfile(profileId)
  deleteProfile(profileId)

  if (deleteFiles) {
    await removePath(instanceDir(profileId))
    logger.info(`Файлы профиля «${profile.name}» удалены`)
  }
}

export function instanceFolder(profileId: string, sub?: (typeof INSTANCE_DIRS)[number]): string {
  return sub ? instanceSubdir(profileId, sub) : instanceDir(profileId)
}

function emitStage(profile: Profile, label: string): void {
  const stage: InstallStage = {
    versionId: profile.gameVersion,
    profileId: profile.id,
    stage: 'loader',
    progress: 0,
    label,
    bytesDone: 0,
    bytesTotal: 0
  }
  emitEvent('install:stage', stage)
}
