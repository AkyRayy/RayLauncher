import { win32 as path } from 'node:path'
import { BrowserWindow, app, shell } from 'electron'
import { registerEventTarget, emitEvent } from './core/events'
import { getWindowBounds, setWindowBounds } from './store/settings.store'
import { EXTERNAL_LINK_ALLOWLIST } from '@shared/constants'
import { logger } from './logger'

let mainWindow: BrowserWindow | null = null

const MIN_WIDTH = 1024
const MIN_HEIGHT = 680

export function createMainWindow(): BrowserWindow {
  const saved = getWindowBounds()

  const window = new BrowserWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 820,
    x: saved?.x,
    y: saved?.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0E0F11',
    roundedCorners: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false
    }
  })

  if (saved?.maximized) window.maximize()

  window.once('ready-to-show', () => {
    window.show()
    logger.info('Главное окно показано')
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalSafely(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const isDevServer = process.env.ELECTRON_RENDERER_URL !== undefined && url.startsWith(process.env.ELECTRON_RENDERER_URL)
    if (!isDevServer && !url.startsWith('file://')) {
      event.preventDefault()
      void openExternalSafely(url)
    }
  })

  const notifyState = (): void => emitEvent('window:state', windowState(window))
  window.on('maximize', notifyState)
  window.on('unmaximize', notifyState)
  window.on('focus', notifyState)
  window.on('blur', notifyState)
  window.on('close', () => persistBounds(window))

  registerEventTarget(window)
  mainWindow = window
  return window
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function windowState(window = getMainWindow()): { maximized: boolean; focused: boolean } {
  return {
    maximized: window?.isMaximized() ?? false,
    focused: window?.isFocused() ?? false
  }
}

export function focusMainWindow(): void {
  const window = getMainWindow()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

export async function openExternalSafely(rawUrl: string): Promise<void> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    logger.warn(`Отклонена некорректная ссылка: ${rawUrl}`)
    return
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    logger.warn(`Отклонён протокол ${url.protocol}`)
    return
  }
  const host = url.hostname.toLowerCase()
  const allowed = EXTERNAL_LINK_ALLOWLIST.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  )
  if (!allowed) {
    logger.warn(`Домен вне белого списка: ${host}`)
    return
  }
  await shell.openExternal(url.toString())
}

function persistBounds(window: BrowserWindow): void {
  const maximized = window.isMaximized()
  const bounds = maximized ? window.getNormalBounds() : window.getBounds()
  setWindowBounds({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    maximized
  })
}

export function loadRenderer(window: BrowserWindow): void {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
    window.webContents.openDevTools({ mode: 'detach' })
    return
  }
  void window.loadFile(path.join(__dirname, '../renderer/index.html'))
}
