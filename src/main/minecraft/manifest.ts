import { z } from 'zod'
import { MOJANG } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { VersionCatalog, VersionSummary, VersionType } from '@shared/types'
import { getJson } from '../core/http'
import { paths, versionJarPath, versionJsonPath } from '../core/paths'
import { pathExists, readJson, writeJson } from '../core/fsx'
import { logger } from '../logger'

const manifestEntrySchema = z.object({
  id: z.string(),
  type: z.string(),
  url: z.string(),
  time: z.string(),
  releaseTime: z.string(),
  sha1: z.string(),
  complianceLevel: z.number().optional()
})

const manifestSchema = z.object({
  latest: z.object({ release: z.string(), snapshot: z.string() }),
  versions: z.array(manifestEntrySchema)
})

export type ManifestEntry = z.infer<typeof manifestEntrySchema>
type Manifest = z.infer<typeof manifestSchema>

const CACHE_TTL_MS = 15 * 60 * 1000

let memory: { manifest: Manifest; fetchedAt: number } | null = null

function cacheFile(): string {
  return `${paths().versions}\\version_manifest_v2.json`
}

export async function loadManifest(refresh = false): Promise<{ manifest: Manifest; fetchedAt: number; fromCache: boolean }> {
  if (!refresh && memory && Date.now() - memory.fetchedAt < CACHE_TTL_MS) {
    return { ...memory, fromCache: false }
  }

  try {
    const manifest = await getJson(MOJANG.versionManifest, manifestSchema)
    memory = { manifest, fetchedAt: Date.now() }
    await writeJson(cacheFile(), { fetchedAt: memory.fetchedAt, manifest })
    logger.info(`Манифест версий обновлён: ${manifest.versions.length} версий, последняя — ${manifest.latest.release}`)
    return { ...memory, fromCache: false }
  } catch (error) {
    const cached = await readJson<{ fetchedAt: number; manifest: unknown }>(cacheFile())
    const parsed = cached ? manifestSchema.safeParse(cached.manifest) : null
    if (parsed?.success) {
      logger.warn('Сеть недоступна, используем сохранённый манифест версий')
      memory = { manifest: parsed.data, fetchedAt: cached?.fetchedAt ?? 0 }
      return { ...memory, fromCache: true }
    }
    throw RayError.from(error, 'NET_OFFLINE')
  }
}

export async function getCatalog(refresh = false): Promise<VersionCatalog> {
  const { manifest, fetchedAt, fromCache } = await loadManifest(refresh)

  const sorted = [...manifest.versions].sort(
    (a, b) => Date.parse(b.releaseTime) - Date.parse(a.releaseTime)
  )

  const versions: VersionSummary[] = await Promise.all(
    sorted.map(async (entry) => ({
      id: entry.id,
      type: normalizeType(entry.type),
      releaseTime: entry.releaseTime,
      complianceLevel: entry.complianceLevel ?? 0,
      installed: await isInstalled(entry.id)
    }))
  )

  return {
    latestRelease: manifest.latest.release,
    latestSnapshot: manifest.latest.snapshot,
    versions,
    fetchedAt,
    fromCache
  }
}

export async function findEntry(versionId: string): Promise<ManifestEntry> {
  const { manifest } = await loadManifest()
  const entry = manifest.versions.find((item) => item.id === versionId)
  if (!entry) {
    throw new RayError('VERSION_NOT_FOUND', `Версия ${versionId} отсутствует в манифесте`, { versionId })
  }
  return entry
}

async function isInstalled(versionId: string): Promise<boolean> {
  const [json, jar] = await Promise.all([
    pathExists(versionJsonPath(versionId)),
    pathExists(versionJarPath(versionId))
  ])
  return json && jar
}

function normalizeType(type: string): VersionType {
  switch (type) {
    case 'release':
    case 'snapshot':
    case 'old_beta':
    case 'old_alpha':
      return type
    default:
      return 'snapshot'
  }
}
