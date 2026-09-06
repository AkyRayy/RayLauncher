import { z } from 'zod'
import { MODRINTH } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { LoaderKind, ModDependency, ModSearchResult, ModVersionInfo } from '@shared/types'
import { getJson, request } from '../core/http'
import { readCache, writeCache } from '../db/cache.repo'
import { logger } from '../logger'

const searchHitSchema = z.object({
  project_id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().default(''),
  icon_url: z.string().nullish(),
  downloads: z.number().default(0),
  categories: z.array(z.string()).default([]),
  date_modified: z.string().optional()
})

const searchSchema = z.object({
  hits: z.array(searchHitSchema),
  offset: z.number().default(0),
  limit: z.number().default(20),
  total_hits: z.number().default(0)
})

const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().default(''),
  body: z.string().default(''),
  icon_url: z.string().nullish(),
  downloads: z.number().default(0),
  categories: z.array(z.string()).default([]),
  game_versions: z.array(z.string()).default([]),
  loaders: z.array(z.string()).default([]),
  updated: z.string().optional(),
  source_url: z.string().nullish(),
  issues_url: z.string().nullish(),
  wiki_url: z.string().nullish()
})

const dependencySchema = z.object({
  project_id: z.string().nullish(),
  version_id: z.string().nullish(),
  dependency_type: z.string()
})

const fileSchema = z.object({
  hashes: z.object({ sha1: z.string().default(''), sha512: z.string().optional() }),
  url: z.string(),
  filename: z.string(),
  primary: z.boolean().default(false),
  size: z.number().default(0)
})

const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  version_number: z.string(),
  game_versions: z.array(z.string()).default([]),
  loaders: z.array(z.string()).default([]),
  version_type: z.string().default('release'),
  date_published: z.string(),
  dependencies: z.array(dependencySchema).default([]),
  files: z.array(fileSchema).default([])
})

export type ModrinthProject = z.infer<typeof projectSchema>

const CACHE_TTL_MS = 10 * 60 * 1000

export interface SearchParams {
  query: string
  gameVersion?: string
  loader?: LoaderKind
  categories?: string[]
  index?: string
  offset?: number
  limit?: number
  projectType?: 'mod' | 'modpack' | 'resourcepack' | 'shader'
}

export function buildFacets(params: SearchParams): string {
  const facets: string[][] = [[`project_type:${params.projectType ?? 'mod'}`]]

  if (params.gameVersion) facets.push([`versions:${params.gameVersion}`])
  if (params.loader && params.loader !== 'vanilla') facets.push([`categories:${params.loader}`])
  if (params.categories?.length) facets.push(params.categories.map((item) => `categories:${item}`))

  return JSON.stringify(facets)
}

export async function searchMods(params: SearchParams): Promise<ModSearchResult> {
  const query = new URLSearchParams({
    query: params.query,
    facets: buildFacets(params),
    index: params.index ?? 'relevance',
    offset: String(params.offset ?? 0),
    limit: String(Math.min(params.limit ?? 20, 100))
  })

  const url = `${MODRINTH.base}/search?${query.toString()}`
  const data = await getJson(url, searchSchema)

  return {
    total: data.total_hits,
    offset: data.offset,
    hits: data.hits.map((hit) => ({
      source: 'modrinth' as const,
      projectId: hit.project_id,
      slug: hit.slug,
      title: hit.title,
      description: hit.description,
      ...(hit.icon_url ? { iconUrl: hit.icon_url } : {}),
      downloads: hit.downloads,
      categories: hit.categories,
      ...(hit.date_modified ? { updated: hit.date_modified } : {})
    }))
  }
}

export async function fetchProject(idOrSlug: string): Promise<ModrinthProject> {
  const key = `modrinth:project:${idOrSlug}`
  const cached = readCache<ModrinthProject>(key)
  if (cached) return cached

  const project = await getJson(`${MODRINTH.base}/project/${encodeURIComponent(idOrSlug)}`, projectSchema)
  writeCache(key, project, CACHE_TTL_MS)
  return project
}

export async function fetchVersions(
  projectId: string,
  filter: { gameVersion?: string; loader?: LoaderKind } = {}
): Promise<ModVersionInfo[]> {
  const query = new URLSearchParams()
  if (filter.gameVersion) query.set('game_versions', JSON.stringify([filter.gameVersion]))
  if (filter.loader && filter.loader !== 'vanilla') {
    query.set('loaders', JSON.stringify([filter.loader]))
  }

  const suffix = query.toString().length > 0 ? `?${query.toString()}` : ''
  const url = `${MODRINTH.base}/project/${encodeURIComponent(projectId)}/version${suffix}`

  const versions = await getJson(url, z.array(versionSchema))
  return versions.map(toVersionInfo).filter((version): version is ModVersionInfo => version !== null)
}

export async function fetchVersion(versionId: string): Promise<ModVersionInfo> {
  const version = await getJson(`${MODRINTH.base}/version/${encodeURIComponent(versionId)}`, versionSchema)
  const info = toVersionInfo(version)

  if (!info) throw new RayError('HTTP_ERROR', 'У версии мода нет файла для загрузки', { versionId })
  return info
}

export async function lookupByHashes(hashes: readonly string[]): Promise<Map<string, ModVersionInfo>> {
  const result = new Map<string, ModVersionInfo>()
  if (hashes.length === 0) return result

  for (const chunk of chunks([...new Set(hashes)], 100)) {
    const response = await request(`${MODRINTH.base}/version_files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: chunk, algorithm: 'sha1' })
    })

    if (!response.ok) {
      logger.warn(`Modrinth не опознал файлы: ответ ${response.status}`)
      continue
    }

    const parsed = z.record(z.string(), versionSchema).safeParse(await response.json())
    if (!parsed.success) continue

    for (const [hash, version] of Object.entries(parsed.data)) {
      const info = toVersionInfo(version)
      if (info) result.set(hash, info)
    }
  }

  return result
}

export async function latestForHashes(
  hashes: readonly string[],
  gameVersion: string,
  loader: LoaderKind
): Promise<Map<string, ModVersionInfo>> {
  const result = new Map<string, ModVersionInfo>()
  if (hashes.length === 0 || loader === 'vanilla') return result

  for (const chunk of chunks([...new Set(hashes)], 100)) {
    const response = await request(`${MODRINTH.base}/version_files/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hashes: chunk,
        algorithm: 'sha1',
        loaders: [loader],
        game_versions: [gameVersion]
      })
    })

    if (!response.ok) {
      logger.warn(`Проверка обновлений вернула ${response.status}`)
      continue
    }

    const parsed = z.record(z.string(), versionSchema).safeParse(await response.json())
    if (!parsed.success) continue

    for (const [hash, version] of Object.entries(parsed.data)) {
      const info = toVersionInfo(version)
      if (info) result.set(hash, info)
    }
  }

  return result
}

function toVersionInfo(version: z.infer<typeof versionSchema>): ModVersionInfo | null {
  const file = version.files.find((item) => item.primary) ?? version.files[0]
  if (!file) return null

  return {
    source: 'modrinth',
    versionId: version.id,
    projectId: version.project_id,
    title: version.name,
    versionNumber: version.version_number,
    gameVersions: version.game_versions,
    loaders: version.loaders,
    releaseType: asReleaseType(version.version_type),
    datePublished: version.date_published,
    downloadUrl: file.url,
    fileName: file.filename,
    size: file.size,
    sha1: file.hashes.sha1,
    ...(file.hashes.sha512 ? { sha512: file.hashes.sha512 } : {}),
    dependencies: version.dependencies.map(toDependency)
  }
}

function toDependency(raw: z.infer<typeof dependencySchema>): ModDependency {
  const kinds: Record<string, ModDependency['kind']> = {
    required: 'required',
    optional: 'optional',
    incompatible: 'incompatible',
    embedded: 'embedded'
  }

  return {
    kind: kinds[raw.dependency_type] ?? 'optional',
    ...(raw.project_id ? { projectId: raw.project_id } : {}),
    ...(raw.version_id ? { versionId: raw.version_id } : {})
  }
}

function asReleaseType(value: string): ModVersionInfo['releaseType'] {
  return value === 'beta' || value === 'alpha' ? value : 'release'
}

function* chunks<T>(items: T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size)
  }
}
