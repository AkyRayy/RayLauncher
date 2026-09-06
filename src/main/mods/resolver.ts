import type { InstallPlan, ModDependency, ModVersionInfo } from '@shared/types'
import { RayError } from '@shared/errors'

export interface VersionSource {
  bestVersion(projectId: string): Promise<ModVersionInfo | null>
  versionById(versionId: string): Promise<ModVersionInfo | null>
  projectTitle(projectId: string): Promise<string>
}

export interface ResolveOptions {
  installedProjectIds: readonly string[]
  maxDepth?: number
}

const DEFAULT_MAX_DEPTH = 8

export async function resolveInstall(
  primary: ModVersionInfo,
  source: VersionSource,
  options: ResolveOptions
): Promise<InstallPlan> {
  const installed = new Set(options.installedProjectIds)
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH

  const dependencies: ModVersionInfo[] = []
  const incompatible: string[] = []
  const missing: string[] = []

  const visited = new Set<string>([primary.projectId])
  const queue: Array<{ dependency: ModDependency; depth: number }> = primary.dependencies.map(
    (dependency) => ({ dependency, depth: 1 })
  )

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break

    const { dependency, depth } = item

    if (dependency.kind === 'incompatible') {
      const id = dependency.projectId
      if (id) incompatible.push(await source.projectTitle(id))
      continue
    }

    if (dependency.kind !== 'required') continue

    const projectId = dependency.projectId
    const versionId = dependency.versionId

    if (!projectId && !versionId) continue
    if (projectId && (visited.has(projectId) || installed.has(projectId))) continue
    if (projectId) visited.add(projectId)

    if (depth > maxDepth) {
      throw new RayError(
        'MOD_DEPENDENCY_CYCLE',
        'Слишком длинная цепочка зависимостей — установите моды по одному',
        { projectId: projectId ?? versionId }
      )
    }

    const resolved = versionId
      ? await source.versionById(versionId)
      : await source.bestVersion(projectId ?? '')

    if (!resolved) {
      missing.push(projectId ? await source.projectTitle(projectId) : (versionId ?? ''))
      continue
    }

    if (installed.has(resolved.projectId)) continue
    visited.add(resolved.projectId)

    dependencies.push(resolved)
    for (const child of resolved.dependencies) {
      queue.push({ dependency: child, depth: depth + 1 })
    }
  }

  return { primary, dependencies, incompatible, missing }
}

export function versionMatches(
  version: ModVersionInfo,
  gameVersion: string,
  loader: string
): boolean {
  if (!version.gameVersions.includes(gameVersion)) return false
  if (version.loaders.length === 0) return true

  if (version.loaders.includes(loader)) return true
  return loader === 'quilt' && version.loaders.includes('fabric')
}

export function pickBestVersion(
  versions: readonly ModVersionInfo[],
  gameVersion: string,
  loader: string
): ModVersionInfo | null {
  const suitable = versions.filter((version) => versionMatches(version, gameVersion, loader))
  if (suitable.length === 0) return null

  const rank = (version: ModVersionInfo): number =>
    version.releaseType === 'release' ? 0 : version.releaseType === 'beta' ? 1 : 2

  return (
    [...suitable].sort((left, right) => {
      const byRank = rank(left) - rank(right)
      if (byRank !== 0) return byRank
      return Date.parse(right.datePublished) - Date.parse(left.datePublished)
    })[0] ?? null
  )
}
