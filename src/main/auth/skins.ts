import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { RayError } from '@shared/errors'
import { ensureDir, pathExists } from '../core/fsx'
import { paths } from '../core/paths'
import { request } from '../core/http'
import { logger } from '../logger'

export interface SkinImage {
  file: string
  hash: string
  width: number
  height: number
  variant: 'classic' | 'slim'
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function readPngSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (data.toString('ascii', 12, 16) !== 'IHDR') return null

  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

export function isValidSkinSize(width: number, height: number): boolean {
  return width === 64 && (height === 64 || height === 32)
}

export function assertSkin(data: Buffer): { width: number; height: number } {
  const size = readPngSize(data)
  if (!size) throw new RayError('INVALID_INPUT', 'Файл не является PNG-изображением')
  if (!isValidSkinSize(size.width, size.height)) {
    throw new RayError(
      'INVALID_INPUT',
      `Скин должен быть 64×64 или 64×32 пикселя, а не ${size.width}×${size.height}`
    )
  }
  return size
}

function cacheFile(hash: string): string {
  return path.join(paths().skins, `${hash}.png`)
}

export async function storeSkin(data: Buffer, variant: 'classic' | 'slim'): Promise<SkinImage> {
  const size = assertSkin(data)
  const hash = createHash('sha1').update(data).digest('hex')
  const file = cacheFile(hash)

  await ensureDir(paths().skins)
  if (!(await pathExists(file))) await writeFile(file, data)

  return { file, hash, width: size.width, height: size.height, variant }
}

export async function cacheSkinFromUrl(url: string, variant: 'classic' | 'slim'): Promise<SkinImage> {
  const response = await request(url, { headers: { Accept: 'image/png' } })
  if (!response.ok) throw new RayError('HTTP_ERROR', `Скин недоступен: ответ ${response.status}`)

  return storeSkin(Buffer.from(await response.arrayBuffer()), variant)
}

export async function importSkinFile(file: string, variant: 'classic' | 'slim'): Promise<SkinImage> {
  const data = await readFile(file)
  return storeSkin(data, variant)
}

export async function skinDataUrl(hash: string): Promise<string | null> {
  const file = cacheFile(hash)
  if (!(await pathExists(file))) return null

  const data = await readFile(file)
  return `data:image/png;base64,${data.toString('base64')}`
}

export function defaultVariantForUuid(uuid: string): 'classic' | 'slim' {
  const clean = uuid.replaceAll('-', '')
  if (clean.length < 32) return 'classic'

  let parity = 0
  for (let index = 0; index < 32; index += 8) {
    parity ^= Number.parseInt(clean.slice(index, index + 8), 16)
  }
  return (parity & 1) === 0 ? 'classic' : 'slim'
}

export async function pruneSkinCache(keepHashes: readonly string[]): Promise<void> {
  const keep = new Set(keepHashes)
  const { readdir, unlink } = await import('node:fs/promises')

  const directory = paths().skins
  if (!(await pathExists(directory))) return

  for (const name of await readdir(directory)) {
    const hash = name.replace(/\.png$/i, '')
    if (keep.has(hash)) continue
    await unlink(path.join(directory, name)).catch(() => undefined)
    logger.debug(`Удалён неиспользуемый скин ${name}`)
  }
}
