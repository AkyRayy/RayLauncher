import { createHash } from 'node:crypto'
import { copyFile, readdir, rm, stat } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dialog, net, protocol } from 'electron'
import type { CustomBackground } from '@shared/types'
import { RayError } from '@shared/errors'
import { paths } from '../core/paths'
import { ensureDir } from '../core/fsx'
import { getSettings, patchSettings } from '../store/settings.store'
import { getMainWindow } from '../window'
import { logger } from '../logger'

export const BACKGROUND_SCHEME = 'ray-bg'

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']
const VIDEO_EXTENSIONS = ['.mp4', '.webm']
const MAX_SIZE_BYTES = 64 * 1024 * 1024

export function registerBackgroundScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: BACKGROUND_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
    }
  ])
}

export function serveBackgrounds(): void {
  protocol.handle(BACKGROUND_SCHEME, async (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''))
    const file = path.join(paths().backgrounds, path.basename(name))

    if (path.dirname(file) !== path.normalize(paths().backgrounds)) {
      return new Response('forbidden', { status: 403 })
    }

    try {
      await stat(file)
    } catch {
      return new Response('not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(file).toString())
  })
}

function describe(file: string): CustomBackground {
  const extension = path.extname(file).toLowerCase()
  return {
    file,
    url: `${BACKGROUND_SCHEME}://local/${encodeURIComponent(file)}`,
    kind: VIDEO_EXTENSIONS.includes(extension) ? 'video' : 'image'
  }
}

export async function currentBackground(): Promise<CustomBackground | null> {
  const name = getSettings().backgroundCustom
  if (name.length === 0) return null

  try {
    await stat(path.join(paths().backgrounds, name))
  } catch {
    return null
  }
  return describe(name)
}

export async function chooseBackground(): Promise<CustomBackground | null> {
  const window = getMainWindow()
  const options: Electron.OpenDialogOptions = {
    title: 'Выберите фон лаунчера',
    properties: ['openFile'],
    filters: [
      { name: 'Изображения и видео', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp4', 'webm'] }
    ]
  }
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)

  const source = result.filePaths[0]
  if (result.canceled || source === undefined) return null

  const extension = path.extname(source).toLowerCase()
  if (![...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].includes(extension)) {
    throw new RayError('INVALID_INPUT', 'Такой формат фона не поддерживается')
  }

  const info = await stat(source)
  if (info.size > MAX_SIZE_BYTES) {
    throw new RayError('INVALID_INPUT', 'Файл больше 64 МБ — выберите вариант полегче')
  }

  const directory = paths().backgrounds
  await ensureDir(directory)

  const name = `${createHash('sha1').update(`${source}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 16)}${extension}`
  const target = path.join(directory, name)
  await copyFile(source, target)
  await dropUnused(name)

  patchSettings({ backgroundId: 'custom', backgroundCustom: name })
  logger.info(`Свой фон установлен: ${name} (${Math.round(info.size / 1024)} КБ)`)
  return describe(name)
}

export async function clearBackground(): Promise<void> {
  patchSettings({ backgroundId: 'night', backgroundCustom: '' })
  await dropUnused('')
}

async function dropUnused(keep: string): Promise<void> {
  const directory = paths().backgrounds
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return
  }

  await Promise.all(
    entries
      .filter((entry) => entry !== keep)
      .map((entry) => rm(path.join(directory, entry), { force: true }))
  )
}
