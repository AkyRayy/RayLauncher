import { win32 as path } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { AUTHLIB_INJECTOR } from '@shared/constants'
import { RayError } from '@shared/errors'
import { ensureDir, pathExists } from '../core/fsx'
import { paths } from '../core/paths'
import { request } from '../core/http'
import { getJson } from '../core/http'
import { logger } from '../logger'

const releaseSchema = z.object({
  tag_name: z.string(),
  assets: z.array(z.object({ name: z.string(), browser_download_url: z.string(), size: z.number() }))
})

export function injectorPath(version: string = AUTHLIB_INJECTOR.version): string {
  return path.join(paths().cache, `authlib-injector-${version}.jar`)
}

export async function ensureInjector(): Promise<string> {
  const pinned = injectorPath()
  if (await pathExists(pinned)) return pinned

  const release = await getJson(AUTHLIB_INJECTOR.releaseApi, releaseSchema, {
    headers: { Accept: 'application/vnd.github+json' }
  })

  const asset = release.assets.find(
    (item) => item.name.endsWith('.jar') && !item.name.endsWith('-sources.jar')
  )
  if (!asset) throw new RayError('HTTP_ERROR', 'В релизе authlib-injector нет jar-файла')

  const version = release.tag_name.replace(/^v/, '')
  const target = injectorPath(version)
  if (await pathExists(target)) return target

  logger.info(`Скачиваю authlib-injector ${version} (${asset.size} байт)`)

  const response = await request(asset.browser_download_url, { headers: { Accept: '*/*' } })
  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `Не удалось скачать authlib-injector: ${response.status}`)
  }

  await ensureDir(paths().cache)
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  return target
}

export interface InjectorOptions {
  jarPath: string
  apiRoot: string
  prefetched?: string
}

export function injectorJvmArgs(options: InjectorOptions): string[] {
  const args = [`-javaagent:${options.jarPath}=${options.apiRoot}`, '-Dauthlibinjector.side=client']
  if (options.prefetched) {
    args.push(`-Dauthlibinjector.yggdrasil.prefetched=${options.prefetched}`)
  }
  return args
}
