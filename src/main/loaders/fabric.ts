import { z } from 'zod'
import { LOADERS } from '@shared/constants'
import { RayError } from '@shared/errors'
import { getJson } from '../core/http'
import { ensureDir, pathExists, writeJson } from '../core/fsx'
import { versionDir, versionJsonPath } from '../core/paths'
import { logger } from '../logger'
import type { LoaderProvider, LoaderVersion } from './types'

const loaderEntrySchema = z.object({
  loader: z.object({
    separator: z.string().optional(),
    build: z.number().optional(),
    maven: z.string().optional(),
    version: z.string(),
    stable: z.boolean().optional()
  })
})

const gameEntrySchema = z.object({ version: z.string(), stable: z.boolean().optional() })

const profileSchema = z
  .object({ id: z.string(), inheritsFrom: z.string().optional(), mainClass: z.string().optional() })
  .passthrough()

function createProvider(kind: 'fabric' | 'quilt', metaRoot: string): LoaderProvider {
  const label = kind === 'fabric' ? 'Fabric' : 'Quilt'

  return {
    kind,

    async listGameVersions(): Promise<string[]> {
      const versions = await getJson(`${metaRoot}/versions/game`, z.array(gameEntrySchema))
      return versions.map((entry) => entry.version)
    },

    async listVersions(gameVersion: string): Promise<LoaderVersion[]> {
      const entries = await getJson(
        `${metaRoot}/versions/loader/${encodeURIComponent(gameVersion)}`,
        z.array(loaderEntrySchema)
      ).catch((error: unknown) => {
        throw asNoVersionError(error, label, gameVersion)
      })

      if (entries.length === 0) {
        throw new RayError('LOADER_NO_VERSION', `${label} не поддерживает Minecraft ${gameVersion}`, {
          gameVersion
        })
      }

      const firstStable = entries.find((entry) => entry.loader.stable !== false)

      return entries.map((entry) => ({
        id: entry.loader.version,
        stable: entry.loader.stable !== false,
        recommended: entry.loader.version === firstStable?.loader.version
      }))
    },

    async install(gameVersion, loaderVersion): Promise<string> {
      const url =
        `${metaRoot}/versions/loader/${encodeURIComponent(gameVersion)}` +
        `/${encodeURIComponent(loaderVersion)}/profile/json`

      const profile = await getJson(url, profileSchema).catch((error: unknown) => {
        throw asNoVersionError(error, label, gameVersion)
      })

      const versionId = profile.id
      const target = versionJsonPath(versionId)

      if (await pathExists(target)) {
        logger.debug(`${label} ${loaderVersion} для ${gameVersion} уже установлен`)
        return versionId
      }

      await ensureDir(versionDir(versionId))
      await writeJson(target, profile)
      logger.info(`${label} ${loaderVersion} установлен как версия ${versionId}`)

      return versionId
    }
  }
}

function asNoVersionError(error: unknown, label: string, gameVersion: string): RayError {
  const rayError = RayError.from(error, 'HTTP_ERROR')
  if (rayError.code === 'NET_OFFLINE' || rayError.code === 'NET_TIMEOUT') return rayError

  return new RayError(
    'LOADER_NO_VERSION',
    `${label} не поддерживает Minecraft ${gameVersion}`,
    { gameVersion, cause: rayError.message }
  )
}

export const fabricProvider = createProvider('fabric', LOADERS.fabricMeta)
export const quiltProvider = createProvider('quilt', LOADERS.quiltMeta)
