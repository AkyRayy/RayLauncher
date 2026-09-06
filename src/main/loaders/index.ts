import type { LoaderKind } from '@shared/types'
import { RayError } from '@shared/errors'
import { ensureJavaRuntime } from '../minecraft/installer'
import { resolveVersion } from '../minecraft/versionResolver'
import { javaComponentOf } from '../minecraft/versionJson'
import { logger } from '../logger'
import { fabricProvider, quiltProvider } from './fabric'
import { forgeProvider } from './forge'
import { neoforgeProvider } from './neoforge'
import type { LoaderProvider, LoaderVersion } from './types'

export type { LoaderProvider, LoaderVersion } from './types'

const providers: Record<Exclude<LoaderKind, 'vanilla'>, LoaderProvider> = {
  fabric: fabricProvider,
  quilt: quiltProvider,
  forge: forgeProvider,
  neoforge: neoforgeProvider
}

export function loaderProvider(kind: LoaderKind): LoaderProvider {
  if (kind === 'vanilla') {
    throw new RayError('INVALID_INPUT', 'У ванильной версии нет загрузчика модов')
  }
  return providers[kind]
}

export function loaderLabel(kind: LoaderKind): string {
  const labels: Record<LoaderKind, string> = {
    vanilla: 'Ванильная',
    fabric: 'Fabric',
    quilt: 'Quilt',
    forge: 'Forge',
    neoforge: 'NeoForge'
  }
  return labels[kind]
}

export async function listLoaderVersions(
  kind: LoaderKind,
  gameVersion: string
): Promise<LoaderVersion[]> {
  if (kind === 'vanilla') return []
  return loaderProvider(kind).listVersions(gameVersion)
}

export async function installLoader(
  kind: LoaderKind,
  gameVersion: string,
  loaderVersion: string
): Promise<string> {
  if (kind === 'vanilla') return gameVersion

  const provider = loaderProvider(kind)

  const needsJava = kind === 'forge' || kind === 'neoforge'
  const javaPath = needsJava ? await javaForGameVersion(gameVersion) : ''

  logger.info(`Устанавливаю ${loaderLabel(kind)} ${loaderVersion} для Minecraft ${gameVersion}`)
  return provider.install(gameVersion, loaderVersion, javaPath)
}

async function javaForGameVersion(gameVersion: string): Promise<string> {
  const { version } = await resolveVersion(gameVersion)
  const java = javaComponentOf(version)
  return ensureJavaRuntime(java.component)
}
