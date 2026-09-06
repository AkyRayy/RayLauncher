import { app, BrowserWindow } from 'electron'
import { APP_NAME } from '@shared/constants'
import { initPaths, isOneDrivePath, paths } from './core/paths'
import { registerBackgroundScheme, serveBackgrounds } from './core/background'
import { ensureDir } from './core/fsx'
import { initLogger, logger, setLogEmitter } from './logger'
import { emitEvent, hasEventTargets } from './core/events'
import { getSettings, initSettings } from './store/settings.store'
import { registerSystemIpc } from './ipc/system.ipc'
import { registerLogsIpc, registerSettingsIpc } from './ipc/settings.ipc'
import { registerDownloadsIpc, registerVersionsIpc } from './ipc/versions.ipc'
import { registerGameIpc } from './ipc/game.ipc'
import { registerAccountsIpc } from './ipc/accounts.ipc'
import { registerProfilesIpc } from './ipc/profiles.ipc'
import { registerModsIpc } from './ipc/mods.ipc'
import { registerNewsIpc, registerUpdatesIpc } from './ipc/news.ipc'
import { initUpdater, disposeUpdater } from './updater/updater'
import { closeDatabase, initDatabase } from './db/database'
import { pruneExpiredCache } from './db/cache.repo'
import { startTokenRefresher, stopTokenRefresher } from './auth/tokenRefresher'
import { stopLocalYggdrasil } from './auth/localYggdrasil'
import { stopAllGames } from './minecraft/launcher'
import { disposeHashPool } from './core/hash'
import { disposeZipPool } from './core/zip'
import { createMainWindow, focusMainWindow, loadRenderer } from './window'

registerBackgroundScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)
  void bootstrap()
}

async function bootstrap(): Promise<void> {
  app.setName(APP_NAME)
  app.setAppUserModelId('com.raylauncher.app')

  const userData = app.getPath('userData')
  initLogger(userData)

  const settings = initSettings(userData)
  const layout = initPaths(userData, settings.gamesDir)

  setLogEmitter((line) => {
    if (hasEventTargets()) emitEvent('launcher:log', line)
  })

  logger.info(`${APP_NAME} ${app.getVersion()} запускается`)
  logger.info(`Данные: ${layout.userData}`)
  logger.info(`Игры: ${layout.games}`)
  if (isOneDrivePath(layout.games)) {
    logger.warn('Каталог игр находится внутри OneDrive — возможны блокировки файлов и лишняя синхронизация')
  }

  await Promise.all([
    ensureDir(layout.logs),
    ensureDir(layout.games),
    ensureDir(layout.cache),
    ensureDir(layout.backgrounds)
  ])

  initDatabase()
  pruneExpiredCache()

  registerSystemIpc()
  registerSettingsIpc()
  registerLogsIpc()
  registerVersionsIpc()
  registerDownloadsIpc()
  registerGameIpc()
  registerAccountsIpc()
  registerProfilesIpc()
  registerModsIpc()
  registerNewsIpc()
  registerUpdatesIpc()

  await app.whenReady()

  serveBackgrounds()
  startTokenRefresher()

  const window = createMainWindow()
  loadRenderer(window)

  initUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      loadRenderer(createMainWindow())
    }
  })
}

app.on('window-all-closed', () => {
  logger.info('Все окна закрыты, выходим')
  app.quit()
})

app.on('will-quit', () => {
  stopAllGames()
  stopTokenRefresher()
  stopLocalYggdrasil()
  disposeUpdater()
  closeDatabase()
  void Promise.all([disposeHashPool(), disposeZipPool()])
})

process.on('unhandledRejection', (reason) => {
  logger.error('Необработанное отклонение промиса:', reason)
})

process.on('uncaughtException', (error) => {
  logger.error('Необработанное исключение:', error)
})

export { paths, getSettings }
