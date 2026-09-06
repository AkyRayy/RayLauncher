import { z } from 'zod'
import { MOJANG } from '@shared/constants'
import { RayError } from '@shared/errors'
import { getJson } from '../../core/http'
import { javaComponentDir, javaExecutable } from '../../core/paths'
import type { DownloadSpec } from '../../downloads/types'

const fileSchema = z.object({
  type: z.enum(['file', 'directory', 'link']),
  executable: z.boolean().optional(),
  target: z.string().optional(),
  downloads: z
    .object({
      raw: z.object({ sha1: z.string(), size: z.number(), url: z.string() }),
      lzma: z.object({ sha1: z.string(), size: z.number(), url: z.string() }).optional()
    })
    .optional()
})

const componentManifestSchema = z.object({
  files: z.record(z.string(), fileSchema)
})

const runtimeEntrySchema = z.object({
  availability: z.object({ group: z.number(), progress: z.number() }).optional(),
  manifest: z.object({ sha1: z.string(), size: z.number(), url: z.string() }),
  version: z.object({ name: z.string(), released: z.string().optional() })
})

const allRuntimesSchema = z.record(z.string(), z.record(z.string(), z.array(runtimeEntrySchema)))

export const JAVA_MAJORS: Record<string, number> = {
  'jre-legacy': 8,
  'java-runtime-alpha': 16,
  'java-runtime-beta': 17,
  'java-runtime-gamma': 17,
  'java-runtime-gamma-snapshot': 17,
  'java-runtime-delta': 21,
  'java-runtime-epsilon': 25,
  'minecraft-java-exe': 14
}

export interface JavaRuntimePlan {
  component: string
  javaPath: string
  directories: string[]
  files: DownloadSpec[]
  links: Array<{ path: string; target: string }>
  totalBytes: number
}

export function platformKey(arch: NodeJS.Architecture): string {
  if (arch === 'arm64') return 'windows-arm64'
  if (arch === 'ia32') return 'windows-x86'
  return 'windows-x64'
}

export async function planJavaRuntime(
  component: string,
  arch: NodeJS.Architecture
): Promise<JavaRuntimePlan> {
  const all = await getJson(MOJANG.javaRuntimeManifest, allRuntimesSchema)
  const platform = all[platformKey(arch)]
  const entries = platform?.[component]
  const entry = entries?.[0]

  if (!entry) {
    throw new RayError(
      'JAVA_MISSING',
      `Mojang не публикует рантайм ${component} для ${platformKey(arch)}`,
      { component, platform: platformKey(arch) }
    )
  }

  const manifest = await getJson(entry.manifest.url, componentManifestSchema)
  const root = javaComponentDir(component)

  const directories: string[] = []
  const files: DownloadSpec[] = []
  const links: Array<{ path: string; target: string }> = []
  let totalBytes = 0

  for (const [relative, item] of Object.entries(manifest.files)) {
    const destination = `${root}\\${relative.split('/').join('\\')}`

    if (item.type === 'directory') {
      directories.push(destination)
      continue
    }
    if (item.type === 'link') {
      if (item.target) links.push({ path: destination, target: item.target })
      continue
    }
    if (!item.downloads) continue

    totalBytes += item.downloads.raw.size
    files.push({
      kind: 'jre',
      url: item.downloads.raw.url,
      dest: destination,
      sha1: item.downloads.raw.sha1,
      size: item.downloads.raw.size,
      label: `${component}/${relative}`
    })
  }

  return {
    component,
    javaPath: javaExecutable(component),
    directories,
    files,
    links,
    totalBytes
  }
}

export function javaMajorOf(component: string, fallback = 8): number {
  return JAVA_MAJORS[component] ?? fallback
}
