import { totalmem } from 'node:os'
import { win32 as path } from 'node:path'
import Store from 'electron-store'
import type { Settings } from '@shared/types'
import { settingsSchema } from '@shared/schemas'
import { DEFAULT_DISCORD_CLIENT_ID, DEFAULT_MS_CLIENT_ID, NETWORK } from '@shared/constants'
import { recommendedMaxMemoryMb } from '@shared/util'
import { logger } from '../logger'

interface StoreShape {
  settings: Settings
  windowBounds?: { width: number; height: number; x?: number; y?: number; maximized: boolean }
}

let store: Store<StoreShape> | null = null
let cached: Settings | null = null

export function defaultSettings(userDataDir: string): Settings {
  const totalMemoryMb = Math.floor(totalmem() / (1024 * 1024))
  return {
    language: 'ru',
    theme: 'system',
    accent: 'amber',
    density: 'comfortable',
    sidebarCollapsed: false,
    backgroundId: 'night',
    backgroundCustom: '',
    backgroundBlur: 0,
    backgroundDim: 0.35,
    backgroundMotion: true,
    gamesDir: path.join(userDataDir, 'games'),
    concurrency: NETWORK.defaultConcurrency,
    speedLimitKbps: 0,
    defaultMemoryMb: recommendedMaxMemoryMb(totalMemoryMb),
    jvmArgs: ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50'],
    closeLauncherOnLaunch: false,
    minimizeToTray: true,
    curseforgeEnabled: false,
    curseforgeKeySet: false,
    msClientId: DEFAULT_MS_CLIENT_ID,
    offlineSkins: true,
    activeProfileId: '',
    guestNickname: 'Player',
    lastVersionId: '',
    updateChannel: 'stable',
    telemetry: false,
    telemetryEndpoint: '',
    onboarded: false,
    discordPresence: true,
    discordClientId: DEFAULT_DISCORD_CLIENT_ID,
    watchdogEnabled: false,
    watchdogTimeoutMin: 10,
    themePackId: '',
    customCssVars: {}
  }
}

export function initSettings(userDataDir: string): Settings {
  store = new Store<StoreShape>({ name: 'config', cwd: userDataDir })
  const fallback = defaultSettings(userDataDir)
  const stored = store.get('settings')
  const parsed = settingsSchema.safeParse({ ...fallback, ...(stored ?? {}) })

  if (!parsed.success) {
    logger.warn('Настройки повреждены, восстановлены значения по умолчанию')
    cached = fallback
  } else {
    cached = parsed.data
  }
  store.set('settings', cached)
  return cached
}

export function getSettings(): Settings {
  if (!cached) throw new Error('initSettings() не вызван')
  return cached
}

export function patchSettings(patch: Partial<Settings>): Settings {
  const next = settingsSchema.parse({ ...getSettings(), ...patch })
  cached = next
  store?.set('settings', next)
  return next
}

export function resetSettings(userDataDir: string): Settings {
  const fresh = defaultSettings(userDataDir)
  const preserved: Partial<Settings> = { onboarded: getSettings().onboarded }
  cached = { ...fresh, ...preserved }
  store?.set('settings', cached)
  return cached
}

export function getWindowBounds(): StoreShape['windowBounds'] {
  return store?.get('windowBounds')
}

export function setWindowBounds(bounds: NonNullable<StoreShape['windowBounds']>): void {
  store?.set('windowBounds', bounds)
}
