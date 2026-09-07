import { randomUUID } from 'node:crypto'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { dialog } from 'electron'
import { z } from 'zod'
import { THEMES } from '@shared/constants'
import { RayError } from '@shared/errors'
import { accentSchema, densitySchema, themeModeSchema } from '@shared/schemas'
import type { Settings, ThemePack } from '@shared/types'
import { emitEvent } from '../core/events'
import { ensureDir, isNotFound, pathExists } from '../core/fsx'
import { paths } from '../core/paths'
import { logger } from '../logger'
import { getSettings, patchSettings } from '../store/settings.store'

const cssVarName = z
  .string()
  .regex(/^--[a-z][a-z0-9-]{1,58}$/, 'Имя переменной: --kebab-case')
const cssVarValue = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => !/[{};]/.test(value), 'Значение без ; и скобок')

export const themePackFileSchema = z.object({
  name: z.string().min(1).max(THEMES.maxNameLength),
  author: z.string().max(60).optional(),
  theme: themeModeSchema,
  accent: accentSchema,
  density: densitySchema,
  cssVars: z.record(cssVarName, cssVarValue).default({})
})

export type ThemePackFile = z.infer<typeof themePackFileSchema>

const BUILTIN_PACKS: readonly ThemePack[] = [
  { id: 'builtin-amber-night', name: 'Янтарная ночь', builtin: true, theme: 'dark', accent: 'amber', density: 'comfortable', cssVars: {} },
  { id: 'builtin-midnight', name: 'Полночь', builtin: true, theme: 'dark', accent: 'indigo', density: 'comfortable', cssVars: {} },
  { id: 'builtin-forest', name: 'Моховой', author: 'RayLauncher', builtin: true, theme: 'dark', accent: 'moss', density: 'comfortable', cssVars: {} },
  { id: 'builtin-ocean', name: 'Океан', author: 'RayLauncher', builtin: true, theme: 'dark', accent: 'azure', density: 'comfortable', cssVars: {
    '--accent': '#2f7de1',
    '--accent-hover': '#2568c4',
    '--accent-soft': 'rgb(47 125 225 / 0.14)'
  } },
  { id: 'builtin-sunset', name: 'Закат', author: 'RayLauncher', builtin: true, theme: 'dark', accent: 'rose', density: 'comfortable', cssVars: {
    '--accent': '#e2622b',
    '--accent-hover': '#c4521f',
    '--accent-soft': 'rgb(226 98 43 / 0.14)'
  } },
  { id: 'builtin-paper', name: 'Бумажная', builtin: true, theme: 'light', accent: 'graphite', density: 'comfortable', cssVars: {} }
]

function themesDir(): string {
  return path.join(paths().userData, 'themes')
}

export async function listThemes(): Promise<ThemePack[]> {
  const packs: ThemePack[] = [...BUILTIN_PACKS]
  const directory = themesDir()

  if (!(await pathExists(directory))) return packs

  const names = await readdir(directory).catch(() => [])
  for (const name of names) {
    if (!name.endsWith(`.${THEMES.fileExtension}`)) continue
    const pack = await readPack(path.join(directory, name)).catch(() => null)
    if (pack) packs.push(pack)
  }

  return packs
}

async function readPack(file: string): Promise<ThemePack | null> {
  const raw: unknown = JSON.parse(await readFile(file, 'utf8'))
  const parsed = themePackFileSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn(`Тема пропущена (${path.basename(file)}): неверный формат`)
    return null
  }
  return { ...parsed.data, id: `user-${path.basename(file, `.${THEMES.fileExtension}`)}`, builtin: false }
}

export async function applyTheme(id: string): Promise<Settings> {
  const packs = await listThemes()
  const pack = packs.find((item) => item.id === id)
  if (!pack) throw new RayError('INVALID_INPUT', 'Тема не найдена', { themeId: id })

  const settings = patchSettings({
    theme: pack.theme,
    accent: pack.accent,
    density: pack.density,
    customCssVars: pack.cssVars,
    themePackId: pack.id
  })
  emitEvent('settings:changed', settings)
  logger.info(`Применена тема «${pack.name}»`)
  return settings
}

export async function importTheme(): Promise<ThemePack | null> {
  const picked = await dialog.showOpenDialog({
    title: 'Выберите файл темы',
    filters: [{ name: 'Тема RayLauncher', extensions: ['json'] }],
    properties: ['openFile']
  })

  const file = picked.filePaths[0]
  if (picked.canceled || !file) return null

  let raw: unknown
  try {
    raw = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    throw new RayError('INVALID_INPUT', 'Файл темы повреждён: это не JSON')
  }

  const parsed = themePackFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new RayError('INVALID_INPUT', 'Файл темы не подходит: проверьте поля name/theme/accent/density')
  }

  const directory = themesDir()
  await ensureDir(directory)

  const slug = parsed.data.name
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const fileName = `${slug.length > 0 ? slug : 'theme'}-${randomUUID().slice(0, 6)}.${THEMES.fileExtension}`
  await writeFile(path.join(directory, fileName), `${JSON.stringify(parsed.data, null, 2)}\n`, 'utf8')

  logger.info(`Импортирована тема «${parsed.data.name}»`)
  const packs = await listThemes()
  const imported = packs.find((item) => !item.builtin && item.name === parsed.data.name) ?? null
  if (imported) await applyTheme(imported.id)
  return imported
}

export async function exportTheme(id?: string): Promise<{ path: string | null }> {
  let data: ThemePackFile
  let fileName: string

  if (id) {
    const packs = await listThemes()
    const pack = packs.find((item) => item.id === id)
    if (!pack) throw new RayError('INVALID_INPUT', 'Тема не найдена', { themeId: id })
    data = { name: pack.name, theme: pack.theme, accent: pack.accent, density: pack.density, cssVars: pack.cssVars }
    fileName = `${pack.name}.${THEMES.fileExtension}`
  } else {
    const settings = getSettings()
    data = {
      name: 'Моя тема',
      theme: settings.theme,
      accent: settings.accent,
      density: settings.density,
      cssVars: settings.customCssVars
    }
    fileName = `my-theme.${THEMES.fileExtension}`
  }

  const picked = await dialog.showSaveDialog({
    title: 'Сохранить тему',
    defaultPath: fileName,
    filters: [{ name: 'Тема RayLauncher', extensions: ['json'] }]
  })

  if (picked.canceled || !picked.filePath) return { path: null }
  await writeFile(picked.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return { path: picked.filePath }
}

export async function deleteTheme(id: string): Promise<void> {
  const packs = await listThemes()
  const pack = packs.find((item) => item.id === id)
  if (!pack) return
  if (pack.builtin) throw new RayError('INVALID_INPUT', 'Встроенную тему удалить нельзя')

  const file = path.join(themesDir(), `${id.replace(/^user-/, '')}.${THEMES.fileExtension}`)
  await rm(file, { force: true }).catch((error: unknown) => {
    if (!isNotFound(error)) throw error
  })

  if (getSettings().themePackId === id) {
    const settings = patchSettings({ themePackId: '', customCssVars: {} })
    emitEvent('settings:changed', settings)
  }
  logger.info(`Тема «${pack.name}» удалена`)
}
