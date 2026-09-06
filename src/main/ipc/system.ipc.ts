import { totalmem } from 'node:os'
import { app, dialog, shell } from 'electron'
import type { AppInfo } from '@shared/types'
import type { FolderTarget } from '@shared/ipc'
import { handle } from './registry'
import { getMainWindow, openExternalSafely, windowState } from '../window'
import { isOneDrivePath, paths } from '../core/paths'
import { chooseBackground, clearBackground, currentBackground } from '../core/background'
import { ensureDir } from '../core/fsx'

export function registerSystemIpc(): void {
  handle('app:info', (): AppInfo => {
    const p = paths()
    return {
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      userDataDir: p.userData,
      gamesDir: p.games,
      logsDir: p.logs,
      totalMemoryMb: Math.floor(totalmem() / (1024 * 1024)),
      oneDriveWarning: isOneDrivePath(p.games)
    }
  })

  handle('window:minimize', () => {
    getMainWindow()?.minimize()
  })

  handle('window:toggleMaximize', () => {
    const window = getMainWindow()
    if (window?.isMaximized()) window.unmaximize()
    else window?.maximize()
    return windowState(window)
  })

  handle('window:close', () => {
    getMainWindow()?.close()
  })

  handle('window:state', () => windowState())

  handle('background:choose', () => chooseBackground())
  handle('background:current', () => currentBackground())
  handle('background:clear', () => clearBackground())

  handle('system:openExternal', async ({ url }) => {
    await openExternalSafely(url)
  })

  handle('system:openFolder', async ({ target }) => {
    const directory = folderPath(target)
    await ensureDir(directory)
    await shell.openPath(directory)
  })

  handle('system:chooseDirectory', async ({ title }) => {
    const window = getMainWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: title ?? 'Выберите папку',
          properties: ['openDirectory', 'createDirectory'],
          buttonLabel: 'Выбрать'
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })

    return { path: result.canceled ? null : (result.filePaths[0] ?? null) }
  })
}

function folderPath(target: FolderTarget): string {
  const p = paths()
  switch (target) {
    case 'games':
      return p.games
    case 'logs':
      return p.logs
    case 'instances':
      return p.instances
    case 'userData':
      return p.userData
  }
}
