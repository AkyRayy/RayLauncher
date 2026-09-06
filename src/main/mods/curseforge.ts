import { z } from 'zod'
import { CURSEFORGE } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { LoaderKind, ModSearchResult, ModVersionInfo } from '@shared/types'
import { request } from '../core/http'
import { getSecret, SECRET_KEYS, setSecret, deleteSecret } from '../store/secrets'
import { getSettings, patchSettings } from '../store/settings.store'

const LOADER_TYPE: Record<Exclude<LoaderKind, 'vanilla'>, number> = {
  forge: 1,
  fabric: 4,
  quilt: 5,
  neoforge: 6
}

const modSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  summary: z.string().default(''),
  downloadCount: z.number().default(0),
  logo: z.object({ thumbnailUrl: z.string().optional() }).nullish(),
  categories: z.array(z.object({ name: z.string() })).default([]),
  dateModified: z.string().optional()
})

const searchSchema = z.object({
  data: z.array(modSchema),
  pagination: z.object({ index: z.number(), totalCount: z.number() }).optional()
})

const fileSchema = z.object({
  id: z.number(),
  modId: z.number(),
  displayName: z.string(),
  fileName: z.string(),
  releaseType: z.number().default(1),
  fileDate: z.string(),
  fileLength: z.number().default(0),
  downloadUrl: z.string().nullish(),
  gameVersions: z.array(z.string()).default([]),
  hashes: z.array(z.object({ value: z.string(), algo: z.number() })).default([]),
  dependencies: z.array(z.object({ modId: z.number(), relationType: z.number() })).default([])
})

const filesSchema = z.object({ data: z.array(fileSchema) })
const singleModSchema = z.object({ data: modSchema })

export async function curseforgeKey(): Promise<string | null> {
  return getSecret(SECRET_KEYS.curseforge)
}

export async function setCurseforgeKey(key: string): Promise<void> {
  const trimmed = key.trim()

  if (trimmed.length === 0) {
    await deleteSecret(SECRET_KEYS.curseforge)
    patchSettings({ curseforgeKeySet: false, curseforgeEnabled: false })
    return
  }

  await setSecret(SECRET_KEYS.curseforge, trimmed)
  patchSettings({ curseforgeKeySet: true })
}

export async function isCurseforgeReady(): Promise<boolean> {
  return getSettings().curseforgeEnabled && (await curseforgeKey()) !== null
}

async function call<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const key = await curseforgeKey()
  if (!key) {
    throw new RayError(
      'CURSEFORGE_NO_KEY',
      'Для CurseForge нужен личный ключ API — добавьте его в настройках модов'
    )
  }

  const response = await request(`${CURSEFORGE.base}${path}`, {
    method: (init?.method as 'GET' | 'POST' | undefined) ?? 'GET',
    headers: {
      'x-api-key': key,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(typeof init?.body === 'string' ? { body: init.body } : {})
  })

  if (response.status === 403) {
    throw new RayError('CURSEFORGE_NO_KEY', 'CurseForge отклонил ключ API')
  }
  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `CurseForge ответил ${response.status}`, { path })
  }

  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ CurseForge')

  return parsed.data
}

export async function searchMods(params: {
  query: string
  gameVersion?: string
  loader?: LoaderKind
  offset?: number
  limit?: number
}): Promise<ModSearchResult> {
  const query = new URLSearchParams({
    gameId: String(CURSEFORGE.gameId),
    classId: String(CURSEFORGE.classId.mods),
    searchFilter: params.query,
    sortField: '2',
    sortOrder: 'desc',
    index: String(params.offset ?? 0),
    pageSize: String(Math.min(params.limit ?? 20, 50))
  })

  if (params.gameVersion) query.set('gameVersion', params.gameVersion)
  if (params.loader && params.loader !== 'vanilla') {
    query.set('modLoaderType', String(LOADER_TYPE[params.loader]))
  }

  const data = await call(`/mods/search?${query.toString()}`, searchSchema)

  return {
    total: data.pagination?.totalCount ?? data.data.length,
    offset: data.pagination?.index ?? 0,
    hits: data.data.map((mod) => ({
      source: 'curseforge' as const,
      projectId: String(mod.id),
      slug: mod.slug,
      title: mod.name,
      description: mod.summary,
      ...(mod.logo?.thumbnailUrl ? { iconUrl: mod.logo.thumbnailUrl } : {}),
      downloads: mod.downloadCount,
      categories: mod.categories.map((category) => category.name),
      ...(mod.dateModified ? { updated: mod.dateModified } : {})
    }))
  }
}

export async function fetchProjectTitle(projectId: string): Promise<string> {
  const data = await call(`/mods/${encodeURIComponent(projectId)}`, singleModSchema)
  return data.data.name
}

export async function fetchVersions(
  projectId: string,
  filter: { gameVersion?: string; loader?: LoaderKind } = {}
): Promise<ModVersionInfo[]> {
  const query = new URLSearchParams({ pageSize: '50' })
  if (filter.gameVersion) query.set('gameVersion', filter.gameVersion)
  if (filter.loader && filter.loader !== 'vanilla') {
    query.set('modLoaderType', String(LOADER_TYPE[filter.loader]))
  }

  const data = await call(
    `/mods/${encodeURIComponent(projectId)}/files?${query.toString()}`,
    filesSchema
  )

  return data.data
    .map((file) => toVersionInfo(file, projectId))
    .filter((version): version is ModVersionInfo => version !== null)
}

export async function fetchVersion(projectId: string, fileId: string): Promise<ModVersionInfo> {
  const versions = await fetchVersions(projectId)
  const found = versions.find((version) => version.versionId === fileId)

  if (!found) throw new RayError('HTTP_ERROR', 'Файл мода не найден на CurseForge', { fileId })
  return found
}

function toVersionInfo(file: z.infer<typeof fileSchema>, projectId: string): ModVersionInfo | null {
  if (!file.downloadUrl) return null

  const sha1 = file.hashes.find((hash) => hash.algo === 1)?.value ?? ''
  const loaders = file.gameVersions
    .map((value) => value.toLowerCase())
    .filter((value) => ['forge', 'fabric', 'quilt', 'neoforge'].includes(value))

  return {
    source: 'curseforge',
    versionId: String(file.id),
    projectId,
    title: file.displayName,
    versionNumber: file.displayName,
    gameVersions: file.gameVersions.filter((value) => /^\d/.test(value)),
    loaders,
    releaseType: file.releaseType === 2 ? 'beta' : file.releaseType === 3 ? 'alpha' : 'release',
    datePublished: file.fileDate,
    downloadUrl: file.downloadUrl,
    fileName: file.fileName,
    size: file.fileLength,
    sha1,
    dependencies: file.dependencies.map((dependency) => ({
      kind: dependency.relationType === 3 ? ('required' as const) : ('optional' as const),
      projectId: String(dependency.modId)
    }))
  }
}
