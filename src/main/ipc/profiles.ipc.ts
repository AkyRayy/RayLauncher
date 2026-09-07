import { shell } from 'electron'
import type { Profile } from '@shared/types'
import { RayError } from '@shared/errors'
import { handle } from './registry'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import {
  createProfile,
  duplicateProfile,
  listProfiles,
  requireProfile,
  updateProfile
} from '../db/profiles.repo'
import {
  installProfile,
  instanceFolder,
  launchProfile,
  prepareInstance,
  removeProfile
} from '../profiles/profileService'
import { createFromTemplate, listTemplates } from '../profiles/templates'
import { listLoaderVersions } from '../loaders'
import { isRunning } from '../minecraft/launcher'

export function registerProfilesIpc(): void {
  handle('profiles:list', () => listProfiles())

  handle('profiles:get', ({ profileId }) => requireProfile(profileId))

  handle('profiles:create', async (input): Promise<Profile> => {
    const profile = createProfile({
      name: input.name,
      gameVersion: input.gameVersion,
      loader: input.loader,
      ...(input.accountId ? { accountId: input.accountId } : {}),
      ...(input.memory ? { memory: input.memory } : {}),
      ...(input.java ? { java: input.java } : {})
    })

    await prepareInstance(profile.id)
    broadcast()
    logger.info(`Создан профиль «${profile.name}» (${profile.id})`)

    return profile
  })

  handle('profiles:update', ({ profileId, patch }): Profile => {
    const current = requireProfile(profileId)

    const invalidates =
      (patch.gameVersion !== undefined && patch.gameVersion !== current.gameVersion) ||
      (patch.loader !== undefined &&
        (patch.loader.kind !== current.loader.kind || patch.loader.version !== current.loader.version))

    const profile = updateProfile(profileId, {
      ...patch,
      ...(invalidates ? { resolvedVersionId: undefined } : {})
    })

    broadcast()
    return profile
  })

  handle('profiles:duplicate', async ({ profileId }): Promise<Profile> => {
    const copy = duplicateProfile(profileId)
    await prepareInstance(copy.id)
    broadcast()
    return copy
  })

  handle('profiles:delete', async ({ profileId, deleteFiles }) => {
    if (isRunning(profileId)) {
      throw new RayError('GAME_ALREADY_RUNNING', 'Сначала закройте игру этого профиля')
    }
    await removeProfile(profileId, deleteFiles)
    broadcast()
  })

  handle('profiles:install', async ({ profileId, verify }) => {
    const result = await installProfile(profileId, verify === true)
    broadcast()
    return { versionId: result.versionId, javaComponent: result.javaComponent }
  })

  handle('profiles:launch', async ({ profileId }) => {
    const state = await launchProfile(profileId)
    broadcast()
    return state
  })

  handle('profiles:openFolder', async ({ profileId, sub }) => {
    const target = instanceFolder(profileId, sub)
    await prepareInstance(profileId)
    await shell.openPath(target)
  })

  handle('profiles:loaderVersions', async ({ kind, gameVersion }) => {
    if (kind === 'vanilla') return []
    return listLoaderVersions(kind, gameVersion)
  })

  handle('profiles:templates', () => listTemplates())

  handle('profiles:createFromTemplate', async ({ templateId, name }) => {
    return createFromTemplate(templateId, name)
  })
}

function broadcast(): void {
  emitEvent('profiles:changed', listProfiles())
}
