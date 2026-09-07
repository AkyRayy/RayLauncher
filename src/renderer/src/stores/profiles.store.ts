import { create } from 'zustand'
import type { LoaderKind, Profile, ProfileTemplate } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'
import { useSettingsStore } from './settings.store'

type LoaderVersion = { id: string; stable: boolean; recommended?: boolean }

interface ProfilesState {
  profiles: Profile[]
  ready: boolean
  busyId: string | null
  error: RayError | null
  loaderVersions: Record<string, LoaderVersion[]>
  loadingLoader: boolean
  hydrate: () => Promise<void>
  create: (input: {
    name: string
    gameVersion: string
    loader: { kind: LoaderKind; version?: string }
    memory?: { auto: boolean; minMb: number; maxMb: number }
  }) => Promise<Profile | null>
  update: (profileId: string, patch: Partial<Profile>) => Promise<void>
  duplicate: (profileId: string) => Promise<void>
  remove: (profileId: string, deleteFiles: boolean) => Promise<void>
  install: (profileId: string) => Promise<void>
  openFolder: (profileId: string, sub?: 'mods' | 'saves' | 'logs' | 'crash-reports') => Promise<void>
  fetchLoaderVersions: (kind: LoaderKind, gameVersion: string) => Promise<LoaderVersion[]>
  templates: ProfileTemplate[]
  loadTemplates: () => Promise<void>
  createFromTemplate: (templateId: string, name?: string) => Promise<Profile | null>
  setActive: (profileId: string) => Promise<void>
  clearError: () => void
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  ready: false,
  busyId: null,
  error: null,
  loaderVersions: {},
  loadingLoader: false,
  templates: [],

  hydrate: async () => {
    const profiles = await api.profiles.list()
    set({ profiles, ready: true })
  },

  create: async (input) => {
    set({ error: null })
    try {
      const profile = await api.profiles.create(input)
      await get().hydrate()
      await get().setActive(profile.id)
      return profile
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
      return null
    }
  },

  update: async (profileId, patch) => {
    set({ error: null })
    try {
      await api.profiles.update({ profileId, patch })
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  duplicate: async (profileId) => {
    await api.profiles.duplicate(profileId)
    await get().hydrate()
  },

  remove: async (profileId, deleteFiles) => {
    set({ error: null })
    try {
      await api.profiles.remove({ profileId, deleteFiles })
      if (useSettingsStore.getState().settings.activeProfileId === profileId) {
        await useSettingsStore.getState().patch({ activeProfileId: '' })
      }
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  install: async (profileId) => {
    set({ busyId: profileId, error: null })
    try {
      await api.profiles.install({ profileId })
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busyId: null })
    }
  },

  openFolder: async (profileId, sub) => {
    await api.profiles.openFolder(sub ? { profileId, sub } : { profileId })
  },

  fetchLoaderVersions: async (kind, gameVersion) => {
    if (kind === 'vanilla') return []

    const key = `${kind}:${gameVersion}`
    const cached = get().loaderVersions[key]
    if (cached) return cached

    set({ loadingLoader: true, error: null })
    try {
      const versions = await api.profiles.loaderVersions({ kind, gameVersion })
      set({ loaderVersions: { ...get().loaderVersions, [key]: versions } })
      return versions
    } catch (error) {
      set({ error: RayError.from(error, 'LOADER_NO_VERSION') })
      return []
    } finally {
      set({ loadingLoader: false })
    }
  },

  setActive: async (profileId) => {
    await useSettingsStore.getState().patch({ activeProfileId: profileId })
  },

  loadTemplates: async () => {
    try {
      set({ templates: await api.profiles.templates() })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  createFromTemplate: async (templateId, name) => {
    set({ error: null })
    try {
      const profile = await api.profiles.createFromTemplate({ templateId, name })
      await get().hydrate()
      await get().setActive(profile.id)
      return profile
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
      return null
    }
  },

  clearError: () => set({ error: null })
}))

api.on['profiles:changed']((profiles) => {
  useProfilesStore.setState({ profiles })
})

export function useActiveProfile(): Profile | null {
  const activeId = useSettingsStore((state) => state.settings.activeProfileId)
  return useProfilesStore((state) => state.profiles.find((item) => item.id === activeId) ?? null)
}
