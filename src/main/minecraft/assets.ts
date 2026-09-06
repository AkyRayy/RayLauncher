import { z } from 'zod'
import { MOJANG } from '@shared/constants'
import { getJson } from '../core/http'
import { assetObjectPath, paths } from '../core/paths'
import { fileSize, writeJson } from '../core/fsx'
import type { DownloadSpec } from '../downloads/types'
import type { VersionJson } from './versionJson'

const assetIndexSchema = z.object({
  objects: z.record(z.string(), z.object({ hash: z.string(), size: z.number() })),
  virtual: z.boolean().optional(),
  map_to_resources: z.boolean().optional()
})

export type AssetIndex = z.infer<typeof assetIndexSchema>

export interface AssetPlan {
  indexId: string
  index: AssetIndex
  downloads: DownloadSpec[]
  totalObjects: number
}

export async function planAssets(version: VersionJson): Promise<AssetPlan | null> {
  const assetIndex = version.assetIndex
  if (!assetIndex) return null

  const index = await getJson(assetIndex.url, assetIndexSchema)
  const indexPath = `${paths().assetIndexes}\\${assetIndex.id}.json`
  await writeJson(indexPath, index)

  const entries = Object.values(index.objects)
  const unique = new Map<string, { hash: string; size: number }>()
  for (const entry of entries) unique.set(entry.hash, entry)

  const downloads: DownloadSpec[] = []
  for (const entry of unique.values()) {
    const dest = assetObjectPath(entry.hash)
    const existing = await fileSize(dest)
    if (existing === entry.size) continue

    downloads.push({
      kind: 'asset',
      url: `${MOJANG.resources}/${entry.hash.slice(0, 2)}/${entry.hash}`,
      dest,
      sha1: entry.hash,
      size: entry.size,
      label: `ресурс ${entry.hash.slice(0, 8)}`
    })
  }

  return { indexId: assetIndex.id, index, downloads, totalObjects: unique.size }
}

export function virtualAssetLinks(
  plan: AssetPlan,
  instanceResourcesDir: string
): Array<{ from: string; to: string }> {
  if (!plan.index.virtual && !plan.index.map_to_resources) return []

  const root = plan.index.map_to_resources
    ? instanceResourcesDir
    : `${paths().assets}\\virtual\\${plan.indexId}`

  return Object.entries(plan.index.objects).map(([name, object]) => ({
    from: assetObjectPath(object.hash),
    to: `${root}\\${name.split('/').join('\\')}`
  }))
}
