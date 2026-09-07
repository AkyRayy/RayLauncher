import { create } from 'zustand'
import type { Settings } from '@shared/types'
import { DEFAULT_DISCORD_CLIENT_ID, DEFAULT_MS_CLIENT_ID } from '@shared/constants'
import { api } from '@renderer/lib/api'

interface SettingsState {
  settings: Settings
  ready: boolean
  load: () => Promise<void>
  patch: (patch: Partial<Settings>) => Promise<void>
  reset: () => Promise<void>
  applyExternal: (settings: Settings) => void
}

const initial: Settings = {
  language: 'ru',
  theme: 'system',
  accent: 'amber',
  backgroundId: 'night',
  backgroundCustom: '',
  backgroundBlur: 0,
  backgroundDim: 0.35,
  backgroundMotion: true,
  density: 'comfortable',
  sidebarCollapsed: false,
  gamesDir: '',
  concurrency: 8,
  speedLimitKbps: 0,
  defaultMemoryMb: 4096,
  jvmArgs: [],
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
  discordPresence: false,
  discordClientId: DEFAULT_DISCORD_CLIENT_ID,
  watchdogEnabled: false,
  watchdogTimeoutMin: 10,
  themePackId: '',
  customCssVars: {}
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: initial,
  ready: false,

  load: async () => {
    const settings = await api.settings.get()
    set({ settings, ready: true })
  },

  patch: async (patch) => {
    set((state) => ({ settings: { ...state.settings, ...patch } }))
    const settings = await api.settings.patch(patch)
    set({ settings })
  },

  reset: async () => {
    const settings = await api.settings.reset()
    set({ settings })
  },

  applyExternal: (settings) => set({ settings, ready: true })
}))

api.on['settings:changed']((settings) => {
  useSettingsStore.getState().applyExternal(settings)
})
