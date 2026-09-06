import { writeFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { LOADERS } from '@shared/constants'
import { RayError } from '@shared/errors'
import { request } from '../core/http'
import { ensureDir, pathExists } from '../core/fsx'
import { paths, versionJsonPath } from '../core/paths'
import { logger } from '../logger'
import { fetchMavenVersions } from './mavenIndex'
import { runClientInstaller } from './installerRunner'
import type { LoaderProvider, LoaderVersion } from './types'

const GROUP = 'net/neoforged/neoforge'
const LEGACY_GROUP = 'net/neoforged/forge'
const LEGACY_GAME_VERSION = '1.20.1'

export function neoforgePrefix(gameVersion: string): string | null {
  const match = /^1\.(\d+)(?:\.(\d+))?$/.exec(gameVersion)
  if (!match) return null

  const major = match[1] ?? ''
  const minor = match[2] ?? '0'
  return `${major}.${minor}.`
}

export const neoforgeProvider: LoaderProvider = {
  kind: 'neoforge',

  async listGameVersions(): Promise<string[]> {
    const versions = await fetchMavenVersions(LOADERS.neoforgeMavenRepo, GROUP)
    const games = new Set<string>([LEGACY_GAME_VERSION])

    for (const version of versions) {
      const match = /^(\d+)\.(\d+)\./.exec(version)
      if (!match) continue
      games.add(match[2] === '0' ? `1.${match[1]}` : `1.${match[1]}.${match[2]}`)
    }

    return [...games]
  },

  async listVersions(gameVersion: string): Promise<LoaderVersion[]> {
    const legacy = gameVersion === LEGACY_GAME_VERSION
    const all = await fetchMavenVersions(
      LOADERS.neoforgeMavenRepo,
      legacy ? LEGACY_GROUP : GROUP
    )

    const prefix = legacy ? `${LEGACY_GAME_VERSION}-` : neoforgePrefix(gameVersion)
    if (!prefix) {
      throw new RayError('LOADER_NO_VERSION', `NeoForge не выпускался для Minecraft ${gameVersion}`, {
        gameVersion
      })
    }

    const matching = all.filter((version) => version.startsWith(prefix))
    if (matching.length === 0) {
      throw new RayError('LOADER_NO_VERSION', `NeoForge не поддерживает Minecraft ${gameVersion}`, {
        gameVersion
      })
    }

    const firstStable = matching.find((version) => !version.includes('beta'))

    return matching.map((version) => ({
      id: version,
      stable: !version.includes('beta'),
      recommended: version === (firstStable ?? matching[0])
    }))
  },

  async install(gameVersion, loaderVersion, javaPath): Promise<string> {
    const legacy = gameVersion === LEGACY_GAME_VERSION
    const artifact = legacy ? 'forge' : 'neoforge'
    const group = legacy ? LEGACY_GROUP : GROUP

    const expectedId = legacy ? `${gameVersion}-neoforge-${loaderVersion}` : `neoforge-${loaderVersion}`
    if (await pathExists(versionJsonPath(expectedId))) {
      logger.debug(`NeoForge ${loaderVersion} уже установлен`)
      return expectedId
    }

    const url =
      `${LOADERS.neoforgeMavenRepo.replace(/\/+$/, '')}/${group}/${loaderVersion}/` +
      `${artifact}-${loaderVersion}-installer.jar`

    const installerJar = await downloadInstaller(url, `neoforge-${loaderVersion}-installer.jar`)
    const result = await runClientInstaller({ javaPath, installerJar, label: 'NeoForge' })

    return result.versionId
  }
}

export async function downloadInstaller(url: string, fileName: string): Promise<string> {
  const target = path.join(paths().cache, 'installers', fileName)
  if (await pathExists(target)) return target

  logger.info(`Скачиваю установщик загрузчика: ${fileName}`)
  const response = await request(url, { headers: { Accept: 'application/java-archive' } })

  if (!response.ok) {
    throw new RayError('LOADER_NO_VERSION', `Установщик недоступен: ответ ${response.status}`, { url })
  }

  await ensureDir(path.dirname(target))
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  return target
}
