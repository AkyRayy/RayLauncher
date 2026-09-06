import { RayError } from '@shared/errors'
import { getJson } from '../core/http'
import { versionJsonPath } from '../core/paths'
import { readJson, writeJson } from '../core/fsx'
import { logger } from '../logger'
import { findEntry } from './manifest'
import { mergeVersionJson, versionJsonSchema, type VersionJson } from './versionJson'

const MAX_INHERITANCE_DEPTH = 8

export async function loadVersionJson(versionId: string): Promise<VersionJson> {
  const local = await readJson<unknown>(versionJsonPath(versionId))
  if (local) {
    const parsed = versionJsonSchema.safeParse(local)
    if (parsed.success) return parsed.data
    logger.warn(`Локальное описание версии ${versionId} повреждено, перекачиваем`)
  }

  const entry = await findEntry(versionId)
  const remote = await getJson(entry.url, versionJsonSchema)
  await writeJson(versionJsonPath(versionId), remote)
  logger.info(`Описание версии ${versionId} сохранено`)
  return remote
}

export async function resolveVersion(versionId: string): Promise<{
  version: VersionJson
  chain: string[]
}> {
  const chain: string[] = []
  let current = await loadVersionJson(versionId)
  chain.push(current.id)

  let depth = 0
  while (current.inheritsFrom) {
    if (depth >= MAX_INHERITANCE_DEPTH) {
      throw new RayError('INTERNAL', `Слишком длинная цепочка inheritsFrom у версии ${versionId}`, {
        versionId,
        chain
      })
    }
    if (chain.includes(current.inheritsFrom)) {
      throw new RayError('INTERNAL', `Циклическое наследование версий: ${chain.join(' → ')}`, { chain })
    }

    const parent = await loadVersionJson(current.inheritsFrom)
    chain.push(parent.id)
    current = mergeVersionJson(current, parent)
    depth += 1
  }

  return { version: current, chain }
}

export function clientJarVersion(version: VersionJson, chain: string[]): string {
  return version.jar ?? chain.at(-1) ?? version.id
}
