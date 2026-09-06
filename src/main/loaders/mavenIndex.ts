import { RayError } from '@shared/errors'
import { request } from '../core/http'
import { readCache, writeCache } from '../db/cache.repo'

const CACHE_TTL_MS = 30 * 60 * 1000

export function parseMavenMetadata(xml: string): string[] {
  const versions: string[] = []
  const pattern = /<version>([^<]+)<\/version>/g

  let match = pattern.exec(xml)
  while (match !== null) {
    const value = (match[1] ?? '').trim()
    if (value.length > 0) versions.push(value)
    match = pattern.exec(xml)
  }

  return versions
}

export async function fetchMavenVersions(repository: string, groupPath: string): Promise<string[]> {
  const url = `${repository.replace(/\/+$/, '')}/${groupPath}/maven-metadata.xml`
  const cacheKey = `maven:${url}`

  const cached = readCache<string[]>(cacheKey)
  if (cached) return cached

  const response = await request(url, { headers: { Accept: 'application/xml' } })
  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `Список версий недоступен: ответ ${response.status}`, { url })
  }

  const versions = parseMavenMetadata(await response.text()).reverse()
  if (versions.length === 0) {
    throw new RayError('LOADER_NO_VERSION', 'Репозиторий вернул пустой список версий', { url })
  }

  writeCache(cacheKey, versions, CACHE_TTL_MS)
  return versions
}
