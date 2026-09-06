import { instanceSubdir } from '../core/paths'
import { ensureDir, removePath } from '../core/fsx'
import { extractArchive } from '../core/zip'
import { logger } from '../logger'
import type { NativeArchive } from './libraries'

export interface NativesResult {
  directory: string
  files: string[]
}

export async function extractNatives(
  profileId: string,
  archives: NativeArchive[],
  clean = false
): Promise<NativesResult> {
  const directory = instanceSubdir(profileId, 'natives')

  if (clean) await removePath(directory)
  await ensureDir(directory)

  const files: string[] = []
  for (const archive of archives) {
    const extracted = await extractArchive(archive.jarPath, directory, archive.exclude)
    files.push(...extracted)
  }

  logger.info(`Natives профиля ${profileId}: распаковано файлов ${files.length}`)
  return { directory, files }
}
