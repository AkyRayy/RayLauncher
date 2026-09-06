import { z } from 'zod'
import { LOADERS } from '@shared/constants'
import { RayError } from '@shared/errors'
import { getJson } from '../core/http'
import { pathExists } from '../core/fsx'
import { versionJsonPath } from '../core/paths'
import { logger } from '../logger'
import { fetchMavenVersions } from './mavenIndex'
import { downloadInstaller } from './neoforge'
import { runClientInstaller } from './installerRunner'
import type { LoaderProvider, LoaderVersion } from './types'

const GROUP = 'net/minecraftforge/forge'

const promotionsSchema = z.object({ promos: z.record(z.string(), z.string()) })

export function forgePrefix(gameVersion: string): string {
  return `${gameVersion}-`
}

export function forgeShortVersion(gameVersion: string, full: string): string {
  return full.startsWith(forgePrefix(gameVersion)) ? full.slice(forgePrefix(gameVersion).length) : full
}

export const forgeProvider: LoaderProvider = {
  kind: 'forge',

  async listGameVersions(): Promise<string[]> {
    const versions = await fetchMavenVersions(LOADERS.forgeMavenRepo, GROUP)
    const games = new Set<string>()

    for (const version of versions) {
      const game = version.split('-')[0]
      if (game) games.add(game)
    }

    return [...games]
  },

  async listVersions(gameVersion: string): Promise<LoaderVersion[]> {
    const all = await fetchMavenVersions(LOADERS.forgeMavenRepo, GROUP)
    const matching = all.filter((version) => version.startsWith(forgePrefix(gameVersion)))

    if (matching.length === 0) {
      throw new RayError('LOADER_NO_VERSION', `Forge не поддерживает Minecraft ${gameVersion}`, {
        gameVersion
      })
    }

    const promos = await loadPromotions()
    const recommended = promos[`${gameVersion}-recommended`]
    const latest = promos[`${gameVersion}-latest`]

    return matching.map((version) => {
      const short = forgeShortVersion(gameVersion, version)
      return {
        id: version,
        stable: short === recommended || short === latest,
        recommended: short === (recommended ?? latest)
      }
    })
  },

  async install(gameVersion, loaderVersion, javaPath): Promise<string> {
    const expectedId = `${gameVersion}-forge-${forgeShortVersion(gameVersion, loaderVersion)}`
    if (await pathExists(versionJsonPath(expectedId))) {
      logger.debug(`Forge ${loaderVersion} уже установлен`)
      return expectedId
    }

    const url =
      `${LOADERS.forgeMavenRepo.replace(/\/+$/, '')}/${GROUP}/${loaderVersion}/` +
      `forge-${loaderVersion}-installer.jar`

    const installerJar = await downloadInstaller(url, `forge-${loaderVersion}-installer.jar`)
    const result = await runClientInstaller({ javaPath, installerJar, label: 'Forge' })

    return result.versionId
  }
}

async function loadPromotions(): Promise<Record<string, string>> {
  try {
    const data = await getJson(LOADERS.forgePromotions, promotionsSchema)
    return data.promos
  } catch (error) {
    logger.warn(
      `Не удалось прочитать promotions Forge: ${error instanceof Error ? error.message : String(error)}`
    )
    return {}
  }
}
