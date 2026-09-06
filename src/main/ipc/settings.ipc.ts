import { app, dialog } from 'electron'
import { copyFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import type { Settings } from '@shared/types'
import { handle } from './registry'
import { emitEvent } from '../core/events'
import { getSettings, patchSettings, resetSettings } from '../store/settings.store'
import { initPaths, paths } from '../core/paths'
import { logFilePath, logger, recentLines } from '../logger'
import { getMainWindow } from '../window'

export function registerSettingsIpc(): void {
  handle('settings:get', () => getSettings())

  handle('settings:patch', (patch) => {
    const next = patchSettings(patch as Partial<Settings>)
    if (patch.gamesDir) {
      initPaths(app.getPath('userData'), next.gamesDir)
      logger.info(`Каталог игр переключён на ${next.gamesDir}`)
    }
    emitEvent('settings:changed', next)
    return next
  })

  handle('settings:reset', () => {
    const next = resetSettings(app.getPath('userData'))
    initPaths(app.getPath('userData'), next.gamesDir)
    emitEvent('settings:changed', next)
    logger.info('Настройки сброшены к значениям по умолчанию')
    return next
  })
}

export function registerLogsIpc(): void {
  handle('logs:tail', ({ limit }) => recentLines(limit))

  handle('logs:export', async () => {
    const window = getMainWindow()
    const defaultPath = path.join(
      app.getPath('downloads'),
      `raylauncher-log-${new Date().toISOString().slice(0, 10)}.log`
    )
    const result = window
      ? await dialog.showSaveDialog(window, {
          title: 'Сохранить лог',
          defaultPath,
          filters: [{ name: 'Журнал', extensions: ['log', 'txt'] }]
        })
      : await dialog.showSaveDialog({ defaultPath })

    if (result.canceled || !result.filePath) return { path: null }
    await copyFile(logFilePath(paths().userData), result.filePath)
    logger.info(`Лог выгружен в ${result.filePath}`)
    return { path: result.filePath }
  })
}
