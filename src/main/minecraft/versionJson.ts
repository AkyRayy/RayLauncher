import { z } from 'zod'
import type { Rule } from './rules'

const ruleSchema: z.ZodType<Rule> = z.object({
  action: z.enum(['allow', 'disallow']),
  os: z
    .object({ name: z.string().optional(), version: z.string().optional(), arch: z.string().optional() })
    .optional(),
  features: z.record(z.string(), z.boolean()).optional()
})

const artifactSchema = z.object({
  path: z.string().optional(),
  sha1: z.string().optional(),
  size: z.number().optional(),
  url: z.string()
})

const librarySchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  downloads: z
    .object({
      artifact: artifactSchema.optional(),
      classifiers: z.record(z.string(), artifactSchema).optional()
    })
    .optional(),
  natives: z.record(z.string(), z.string()).optional(),
  rules: z.array(ruleSchema).optional(),
  extract: z.object({ exclude: z.array(z.string()).optional() }).optional()
})

const argumentSchema = z.union([
  z.string(),
  z.object({
    rules: z.array(ruleSchema).optional(),
    value: z.union([z.string(), z.array(z.string())])
  })
])

export const versionJsonSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  inheritsFrom: z.string().optional(),
  releaseTime: z.string().optional(),
  time: z.string().optional(),
  mainClass: z.string().optional(),
  minimumLauncherVersion: z.number().optional(),
  complianceLevel: z.number().optional(),
  jar: z.string().optional(),
  javaVersion: z.object({ component: z.string(), majorVersion: z.number() }).optional(),
  assets: z.string().optional(),
  assetIndex: z
    .object({
      id: z.string(),
      sha1: z.string(),
      size: z.number().optional(),
      totalSize: z.number().optional(),
      url: z.string()
    })
    .optional(),
  downloads: z
    .object({
      client: z.object({ sha1: z.string(), size: z.number(), url: z.string() }).optional(),
      server: z.object({ sha1: z.string(), size: z.number(), url: z.string() }).optional()
    })
    .optional(),
  libraries: z.array(librarySchema).optional(),
  arguments: z
    .object({ game: z.array(argumentSchema).optional(), jvm: z.array(argumentSchema).optional() })
    .optional(),
  minecraftArguments: z.string().optional(),
  logging: z
    .object({
      client: z
        .object({
          argument: z.string(),
          type: z.string(),
          file: z.object({ id: z.string(), sha1: z.string(), size: z.number(), url: z.string() })
        })
        .optional()
    })
    .optional()
})

export type VersionJson = z.infer<typeof versionJsonSchema>
export type Library = z.infer<typeof librarySchema>
export type LaunchArgument = z.infer<typeof argumentSchema>

export function mergeVersionJson(child: VersionJson, parent: VersionJson): VersionJson {
  const merged: VersionJson = {
    ...parent,
    ...stripUndefined(child),
    id: child.id
  }

  delete merged.inheritsFrom

  merged.libraries = dedupeLibraries([...(child.libraries ?? []), ...(parent.libraries ?? [])])

  const game = [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])]
  const jvm = [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
  if (game.length > 0 || jvm.length > 0) {
    merged.arguments = {
      ...(game.length > 0 ? { game } : {}),
      ...(jvm.length > 0 ? { jvm } : {})
    }
  }

  merged.assetIndex = child.assetIndex ?? parent.assetIndex
  merged.assets = child.assets ?? parent.assets
  merged.downloads = child.downloads ?? parent.downloads
  merged.logging = child.logging ?? parent.logging
  merged.javaVersion = child.javaVersion ?? parent.javaVersion
  merged.mainClass = child.mainClass ?? parent.mainClass
  merged.minecraftArguments = child.minecraftArguments ?? parent.minecraftArguments
  merged.jar = child.jar ?? parent.jar ?? parent.id

  return merged
}

export function dedupeLibraries(libraries: Library[]): Library[] {
  const seen = new Set<string>()
  const result: Library[] = []

  for (const library of libraries) {
    const key = dedupeKey(library.name)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(library)
  }
  return result
}

function dedupeKey(name: string): string {
  const parts = name.split('@')[0]?.split(':') ?? []
  const [group, artifact, , classifier] = parts
  return [group, artifact, classifier].filter(Boolean).join(':')
}

function stripUndefined(value: VersionJson): VersionJson {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as VersionJson
}

export function javaComponentOf(version: VersionJson): { component: string; majorVersion: number } {
  return version.javaVersion ?? { component: 'jre-legacy', majorVersion: 8 }
}
