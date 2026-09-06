import { win32 as path } from 'node:path'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { LoaderKind, Profile } from '@shared/types'
import { RayError } from '@shared/errors'
import { extractArchive } from '../core/zip'
import { ensureDir, pathExists, removePath } from '../core/fsx'
import { instanceDir, paths } from '../core/paths'
import { enqueueBatch } from '../downloads/manager'
import { logger } from '../logger'
import { createProfile } from '../db/profiles.repo'
import { upsertMany } from '../db/mods.repo'
import { prepareInstance } from '../profiles/profileService'
import { fetchVersion as fetchCurseforgeVersion } from './curseforge'

const mrpackSchema = z.object({
  formatVersion: z.number(),
  name: z.string(),
  versionId: z.string().optional(),
  dependencies: z.record(z.string(), z.string()),
  files: z
    .array(
      z.object({
        path: z.string(),
        hashes: z.object({ sha1: z.string().optional(), sha512: z.string().optional() }).default({}),
        downloads: z.array(z.string()).min(1),
        fileSize: z.number().default(0),
        env: z
          .object({ client: z.string().optional(), server: z.string().optional() })
          .optional()
      })
    )
    .default([])
})

const cfManifestSchema = z.object({
  name: z.string(),
  minecraft: z.object({
    version: z.string(),
    modLoaders: z.array(z.object({ id: z.string(), primary: z.boolean().default(false) })).default([])
  }),
  files: z
    .array(z.object({ projectID: z.number(), fileID: z.number(), required: z.boolean().default(true) }))
    .default([]),
  overrides: z.string().default('overrides')
})

export interface ImportResult {
  profile: Profile
  modsInstalled: number
  filesSkipped: number
}

export async function importModpack(archive: string): Promise<ImportResult> {
  const workDir = path.join(paths().cache, 'packs', `${Date.now()}`)
  await ensureDir(workDir)

  try {
    await extractArchive(archive, workDir)

    if (await pathExists(path.join(workDir, 'modrinth.index.json'))) {
      return await importMrpack(workDir)
    }
    if (await pathExists(path.join(workDir, 'manifest.json'))) {
      return await importCursePack(workDir)
    }

    throw new RayError(
      'INVALID_INPUT',
      'Это не модпак: внутри нет ни modrinth.index.json, ни manifest.json'
    )
  } finally {
    await removePath(workDir)
  }
}

async function importMrpack(workDir: string): Promise<ImportResult> {
  const raw: unknown = JSON.parse(await readFile(path.join(workDir, 'modrinth.index.json'), 'utf8'))
  const parsed = mrpackSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INVALID_INPUT', 'Повреждён modrinth.index.json')

  const index = parsed.data
  const gameVersion = index.dependencies.minecraft
  if (!gameVersion) throw new RayError('INVALID_INPUT', 'В паке не указана версия Minecraft')

  const loader = loaderFromDependencies(index.dependencies)
  const profile = createProfile({
    name: index.name,
    gameVersion,
    loader
  })
  await prepareInstance(profile.id)

  const root = instanceDir(profile.id)

  const clientFiles = index.files.filter((file) => file.env?.client !== 'unsupported')
  const skipped = index.files.length - clientFiles.length

  const handle = enqueueBatch(
    clientFiles.map((file) => ({
      kind: 'mod' as const,
      url: file.downloads[0] ?? '',
      dest: path.join(root, ...file.path.split('/')),
      ...(file.hashes.sha1 ? { sha1: file.hashes.sha1 } : {}),
      size: file.fileSize,
      label: path.basename(file.path),
      ...(file.downloads.length > 1 ? { fallbackUrls: file.downloads.slice(1) } : {}),
      profileId: profile.id
    }))
  )
  await handle.promise

  await applyOverrides(workDir, 'overrides', root)
  await applyOverrides(workDir, 'client-overrides', root)

  const mods = clientFiles.filter((file) => file.path.startsWith('mods/'))
  upsertMany(
    mods.map((file) => ({
      profileId: profile.id,
      source: 'modrinth' as const,
      projectId: file.hashes.sha1 ?? path.basename(file.path),
      versionId: '',
      title: path.basename(file.path).replace(/\.jar$/i, ''),
      slug: '',
      fileName: path.basename(file.path),
      filePath: path.join(root, ...file.path.split('/')),
      sha1: file.hashes.sha1 ?? '',
      ...(file.hashes.sha512 ? { sha512: file.hashes.sha512 } : {}),
      size: file.fileSize,
      enabled: true
    }))
  )

  logger.info(`Импортирован пак «${index.name}»: ${mods.length} модов`)
  return { profile, modsInstalled: mods.length, filesSkipped: skipped }
}

async function importCursePack(workDir: string): Promise<ImportResult> {
  const raw: unknown = JSON.parse(await readFile(path.join(workDir, 'manifest.json'), 'utf8'))
  const parsed = cfManifestSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INVALID_INPUT', 'Повреждён manifest.json модпака')

  const manifest = parsed.data
  const loaderId = manifest.minecraft.modLoaders.find((item) => item.primary)?.id ?? ''
  const profile = createProfile({
    name: manifest.name,
    gameVersion: manifest.minecraft.version,
    loader: loaderFromCurseId(loaderId)
  })
  await prepareInstance(profile.id)

  const root = instanceDir(profile.id)
  const modsRoot = path.join(root, 'mods')
  await ensureDir(modsRoot)

  const versions = []
  let skipped = 0
  for (const file of manifest.files) {
    const version = await fetchCurseforgeVersion(String(file.projectID), String(file.fileID)).catch(
      () => null
    )
    if (version) versions.push(version)
    else skipped += 1
  }

  const handle = enqueueBatch(
    versions.map((version) => ({
      kind: 'mod' as const,
      url: version.downloadUrl,
      dest: path.join(modsRoot, version.fileName),
      ...(version.sha1 ? { sha1: version.sha1 } : {}),
      size: version.size,
      label: version.fileName,
      profileId: profile.id
    }))
  )
  await handle.promise

  await applyOverrides(workDir, manifest.overrides, root)

  upsertMany(
    versions.map((version) => ({
      profileId: profile.id,
      source: 'curseforge' as const,
      projectId: version.projectId,
      versionId: version.versionId,
      title: version.title,
      slug: '',
      fileName: version.fileName,
      filePath: path.join(modsRoot, version.fileName),
      sha1: version.sha1,
      size: version.size,
      enabled: true
    }))
  )

  logger.info(`Импортирован пак «${manifest.name}»: ${versions.length} модов, пропущено ${skipped}`)
  return { profile, modsInstalled: versions.length, filesSkipped: skipped }
}

async function applyOverrides(workDir: string, folder: string, target: string): Promise<void> {
  const source = path.join(workDir, folder)
  if (!(await pathExists(source))) return

  const { cp } = await import('node:fs/promises')
  await cp(source, target, { recursive: true, force: true })
  logger.debug(`Применены overrides из ${folder}`)
}

export function loaderFromDependencies(dependencies: Record<string, string>): {
  kind: LoaderKind
  version?: string
} {
  const map: Array<[string, LoaderKind]> = [
    ['fabric-loader', 'fabric'],
    ['quilt-loader', 'quilt'],
    ['neoforge', 'neoforge'],
    ['forge', 'forge']
  ]

  for (const [key, kind] of map) {
    const version = dependencies[key]
    if (version) return { kind, version }
  }
  return { kind: 'vanilla' }
}

export function loaderFromCurseId(id: string): { kind: LoaderKind; version?: string } {
  const [name, ...rest] = id.split('-')
  const version = rest.join('-')

  const kinds: Record<string, LoaderKind> = {
    forge: 'forge',
    neoforge: 'neoforge',
    fabric: 'fabric',
    quilt: 'quilt'
  }

  const kind = kinds[name ?? ''] ?? 'vanilla'
  return version.length > 0 ? { kind, version } : { kind }
}
