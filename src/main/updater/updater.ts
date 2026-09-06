import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateInfo } from 'electron-updater'
import type { UpdateState } from '@shared/types'
import { RayError } from '@shared/errors'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import { getSettings } from '../store/settings.store'
import { markdownToSafeHtml } from '../news/markdown'

const { autoUpdater } = electronUpdater

const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000

let state: UpdateState = { phase: 'idle', supported: false }
let timer: NodeJS.Timeout | null = null
let wired = false

function updatesEnabled(): boolean {
  return app.isPackaged || process.env.RAY_UPDATER_DEV === '1'
}

export function updateState(): UpdateState {
  return state
}

function setState(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  emitEvent('update:state', state)
}

export function initUpdater(): void {
  state = { phase: 'idle', supported: updatesEnabled() }
  if (!updatesEnabled()) {
    logger.info('Автообновление выключено: сборка не упакована')
    return
  }
  if (!app.isPackaged) {
    logger.warn('Автообновление в режиме разработки: читаю dev-app-update.yml')
  }

  wire()

  setTimeout(() => void checkForUpdates(true), 15_000)
  timer = setInterval(() => void checkForUpdates(true), PERIODIC_CHECK_MS)
  timer.unref()
}

function wire(): void {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.forceDevUpdateConfig = !app.isPackaged
  autoUpdater.logger = {
    info: (message: unknown) => logger.info(`updater: ${String(message)}`),
    warn: (message: unknown) => logger.warn(`updater: ${String(message)}`),
    error: (message: unknown) => logger.error(`updater: ${String(message)}`),
    debug: (message: unknown) => logger.debug(`updater: ${String(message)}`)
  }

  autoUpdater.on('checking-for-update', () => setState({ phase: 'checking' }))

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`Доступна версия ${info.version}`)
    setState({
      phase: 'available',
      version: info.version,
      ...(info.releaseDate ? { releaseDate: info.releaseDate } : {}),
      ...(notesToHtml(info) ? { releaseNotesHtml: notesToHtml(info) } : {})
    })
  })

  autoUpdater.on('update-not-available', () => {
    setState({ phase: 'up-to-date', version: app.getVersion() })
  })

  autoUpdater.on('download-progress', (progress) => {
    setState({
      phase: 'downloading',
      progress: Math.min(1, Math.max(0, progress.percent / 100)),
      bytesPerSecond: Math.round(progress.bytesPerSecond)
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(`Обновление ${info.version} загружено и будет установлено при выходе`)
    setState({ phase: 'ready', version: info.version, progress: 1 })
  })

  autoUpdater.on('error', (error: Error) => {
    logger.error(`Ошибка автообновления: ${error.message}`)
    setState({ phase: 'error', error: error.message })
  })
}

export async function checkForUpdates(silent = false): Promise<UpdateState> {
  if (!updatesEnabled()) {
    return { phase: 'idle', supported: false, version: app.getVersion() }
  }

  wire()
  autoUpdater.allowPrerelease = getSettings().updateChannel === 'beta'

  try {
    await autoUpdater.checkForUpdates()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setState({ phase: 'error', error: message })
    if (!silent) throw new RayError('HTTP_ERROR', `Не удалось проверить обновления: ${message}`)
  }

  return state
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!updatesEnabled()) {
    throw new RayError('INTERNAL', 'Автообновление доступно только в установленной версии')
  }
  if (state.phase === 'downloading') return state

  setState({ phase: 'downloading', progress: 0 })
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    setState({ phase: 'error', error: message })
    throw new RayError('HTTP_ERROR', `Не удалось скачать обновление: ${message}`)
  }

  return state
}

export function quitAndInstall(): void {
  if (!updatesEnabled() || state.phase !== 'ready') {
    throw new RayError('INTERNAL', 'Обновление ещё не загружено')
  }
  logger.info('Перезапуск для установки обновления')
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
}

export function disposeUpdater(): void {
  if (timer) clearInterval(timer)
  timer = null
}

function notesToHtml(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (!notes) return undefined

  if (typeof notes === 'string') return markdownToSafeHtml(notes)

  const joined = notes
    .map((entry) => `### ${entry.version}\n\n${entry.note ?? ''}`)
    .join('\n\n')

  return joined.trim().length > 0 ? markdownToSafeHtml(joined) : undefined
}
