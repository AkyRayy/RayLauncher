import { MOJANG, LOADERS } from '@shared/constants'
import { RayError } from '@shared/errors'

export interface MavenCoordinates {
  group: string
  artifact: string
  version: string
  classifier?: string
  extension: string
}

export function parseMaven(name: string): MavenCoordinates {
  const [coordinates, extensionFromName] = name.split('@', 2)
  const parts = (coordinates ?? '').split(':')
  const [group, artifact, version, classifier] = parts

  if (!group || !artifact || !version || parts.length > 4) {
    throw new RayError('INVALID_INPUT', `Некорректные maven-координаты: ${name}`, { name })
  }

  return {
    group,
    artifact,
    version,
    ...(classifier ? { classifier } : {}),
    extension: extensionFromName ?? 'jar'
  }
}

export function mavenPath(name: string): string {
  const { group, artifact, version, classifier, extension } = parseMaven(name)
  const fileName = classifier
    ? `${artifact}-${version}-${classifier}.${extension}`
    : `${artifact}-${version}.${extension}`
  return `${group.replace(/\./g, '/')}/${artifact}/${version}/${fileName}`
}

export function withClassifier(name: string, classifier: string): string {
  const parsed = parseMaven(name)
  const base = `${parsed.group}:${parsed.artifact}:${parsed.version}:${classifier}`
  return parsed.extension === 'jar' ? base : `${base}@${parsed.extension}`
}

export function repositoryCandidates(libraryUrl?: string): string[] {
  const candidates = [
    libraryUrl,
    MOJANG.libraries,
    LOADERS.fabricMavenRepo,
    LOADERS.neoforgeMavenRepo,
    LOADERS.forgeMavenRepo
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  return [...new Set(candidates.map((url) => (url.endsWith('/') ? url : `${url}/`)))]
}

export function mavenUrl(base: string, name: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${mavenPath(name)}`
}

export function libraryKey(name: string): string {
  const { group, artifact, classifier } = parseMaven(name)
  return classifier ? `${group}:${artifact}:${classifier}` : `${group}:${artifact}`
}
