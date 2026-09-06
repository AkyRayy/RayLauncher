import { win32 as path } from 'node:path'
import type { RuleContext } from './rules'
import { evaluateRules, nativesClassifier } from './rules'
import { libraryPath } from '../core/paths'
import { mavenPath, mavenUrl, repositoryCandidates, withClassifier } from './maven'
import type { DownloadSpec } from '../downloads/types'
import type { Library, VersionJson } from './versionJson'

export interface NativeArchive {
  jarPath: string
  exclude: string[]
}

export interface LibraryPlan {
  downloads: DownloadSpec[]
  classpath: string[]
  natives: NativeArchive[]
}

export function planLibraries(
  version: VersionJson,
  context: RuleContext,
  librariesRoot?: string
): LibraryPlan {
  const downloads: DownloadSpec[] = []
  const classpath: string[] = []
  const natives: NativeArchive[] = []
  const seen = new Set<string>()

  for (const library of version.libraries ?? []) {
    if (!evaluateRules(library.rules, context)) continue

    const nativeKey = nativesClassifier(library.natives, context)

    if (!library.natives || library.downloads?.artifact) {
      const artifact = resolveArtifact(library, library.name, librariesRoot)
      if (artifact && !seen.has(artifact.dest)) {
        seen.add(artifact.dest)
        downloads.push(artifact)
        classpath.push(artifact.dest)
      }
    }

    if (nativeKey) {
      const nativeName = withClassifier(library.name, nativeKey)
      const classifierArtifact = library.downloads?.classifiers?.[nativeKey]
      const native = resolveArtifact(library, nativeName, librariesRoot, classifierArtifact)
      if (native && !seen.has(native.dest)) {
        seen.add(native.dest)
        downloads.push(native)
        natives.push({
          jarPath: native.dest,
          exclude: library.extract?.exclude ?? []
        })
      }
    }
  }

  return { downloads, classpath, natives }
}

function resolveArtifact(
  library: Library,
  name: string,
  librariesRoot: string | undefined,
  explicit?: { path?: string; sha1?: string; size?: number; url: string }
): DownloadSpec | null {
  const artifact = explicit ?? (name === library.name ? library.downloads?.artifact : undefined)
  const relative = artifact?.path ?? mavenPath(name)
  const dest = librariesRoot
    ? path.join(librariesRoot, ...relative.split('/'))
    : libraryPath(relative)

  const mirrors = repositoryCandidates(library.url).map((base) => mavenUrl(base, name))
  const url = artifact?.url && artifact.url.length > 0 ? artifact.url : mirrors[0]
  if (!url) return null

  const fallbackUrls = mirrors.filter((candidate) => candidate !== url)

  return {
    kind: 'library',
    url,
    dest,
    ...(artifact?.sha1 ? { sha1: artifact.sha1 } : {}),
    size: artifact?.size ?? 0,
    label: relative.split('/').at(-1) ?? name,
    ...(fallbackUrls.length > 0 ? { fallbackUrls } : {})
  }
}

export function planClientJar(version: VersionJson, jarPath: string): DownloadSpec | null {
  const client = version.downloads?.client
  if (!client) return null
  return {
    kind: 'client-jar',
    url: client.url,
    dest: jarPath,
    sha1: client.sha1,
    size: client.size,
    label: `${version.id}.jar`
  }
}
