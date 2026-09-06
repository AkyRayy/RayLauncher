import { win32 as path } from 'node:path'
import { LIMITS } from '@shared/constants'
import { RayError } from '@shared/errors'

const { isAbsolute, join, normalize, parse, sep } = path

export interface RayPaths {
  userData: string
  logs: string
  games: string
  versions: string
  libraries: string
  assets: string
  assetIndexes: string
  assetObjects: string
  jre: string
  instances: string
  cache: string
  skins: string
  backgrounds: string
  configFile: string
}

let current: RayPaths | null = null

export function buildPaths(userData: string, gamesDir?: string): RayPaths {
  const games = gamesDir && gamesDir.trim().length > 0 ? normalize(gamesDir) : join(userData, 'games')
  const assets = join(games, 'assets')
  return {
    userData,
    logs: join(userData, 'logs'),
    games,
    versions: join(games, 'versions'),
    libraries: join(games, 'libraries'),
    assets,
    assetIndexes: join(assets, 'indexes'),
    assetObjects: join(assets, 'objects'),
    jre: join(games, 'jre'),
    instances: join(games, 'instances'),
    cache: join(userData, 'cache'),
    skins: join(userData, 'cache', 'skins'),
    backgrounds: join(userData, 'backgrounds'),
    configFile: join(userData, 'config.json')
  }
}

export function initPaths(userData: string, gamesDir?: string): RayPaths {
  current = buildPaths(userData, gamesDir)
  return current
}

export function paths(): RayPaths {
  if (!current) {
    throw new RayError('INTERNAL', 'initPaths() не вызван до обращения к путям')
  }
  return current
}

export function instanceDir(profileId: string, base = paths()): string {
  return join(base.instances, sanitizeSegment(profileId))
}

export function instanceSubdir(
  profileId: string,
  sub: 'mods' | 'saves' | 'config' | 'logs' | 'natives' | 'crash-reports' | 'resourcepacks' | 'shaderpacks',
  base = paths()
): string {
  return join(instanceDir(profileId, base), sub)
}

export function versionDir(versionId: string, base = paths()): string {
  return join(base.versions, sanitizeSegment(versionId))
}

export function versionJsonPath(versionId: string, base = paths()): string {
  const id = sanitizeSegment(versionId)
  return join(base.versions, id, `${id}.json`)
}

export function versionJarPath(versionId: string, base = paths()): string {
  const id = sanitizeSegment(versionId)
  return join(base.versions, id, `${id}.jar`)
}

export function libraryPath(relativeMavenPath: string, base = paths()): string {
  return join(base.libraries, ...relativeMavenPath.split('/').map(sanitizeSegment))
}

export function assetObjectPath(hash: string, base = paths()): string {
  if (!/^[0-9a-f]{40}$/i.test(hash)) {
    throw new RayError('INVALID_INPUT', `Некорректный хеш ресурса: ${hash}`)
  }
  return join(base.assetObjects, hash.slice(0, 2), hash)
}

export function javaComponentDir(component: string, base = paths()): string {
  return join(base.jre, sanitizeSegment(component))
}

export function javaExecutable(component: string, base = paths()): string {
  return join(javaComponentDir(component, base), 'bin', 'java.exe')
}

// eslint-disable-next-line no-control-regex -- управляющие символы недопустимы в именах файлов Windows
const ILLEGAL_SEGMENT = /[<>:"/\\|?*\u0000-\u001f]/g
const RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
])

export function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(ILLEGAL_SEGMENT, '_').replace(/\.{2,}/g, '_').trim()
  if (cleaned.length === 0) return '_'
  const withoutTrailingDots = cleaned.replace(/[. ]+$/, '')
  const safe = withoutTrailingDots.length > 0 ? withoutTrailingDots : '_'
  return RESERVED_NAMES.has(safe.toLowerCase()) ? `_${safe}` : safe
}

export function safeJoin(root: string, ...segments: string[]): string {
  for (const segment of segments) {
    if (isAbsolute(segment)) {
      throw new RayError('INVALID_INPUT', `Абсолютный путь запрещён: ${segment}`)
    }
  }
  const target = normalize(join(root, ...segments))
  const normalizedRoot = normalize(root)
  const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep
  if (target !== normalizedRoot && !target.startsWith(rootWithSep)) {
    throw new RayError('INVALID_INPUT', `Путь выходит за пределы каталога: ${target}`)
  }
  return target
}

export function isPathTooLong(path: string): boolean {
  return path.length > LIMITS.maxPathLength
}

export function assertPathLength(path: string): void {
  if (isPathTooLong(path)) {
    throw new RayError(
      'PATH_TOO_LONG',
      `Путь длиннее ${LIMITS.maxPathLength} символов: ${path}`,
      { path, length: path.length }
    )
  }
}

export function isOneDrivePath(path: string): boolean {
  return /[\\/]OneDrive([\\/]|$)/i.test(path)
}

export function driveOf(path: string): string {
  return parse(normalize(path)).root.replace(/[\\/]+$/, '')
}
