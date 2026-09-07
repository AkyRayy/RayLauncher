import { create } from 'zustand'
import type { ThemePack } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

interface ThemesState {
  packs: ThemePack[]
  ready: boolean
  busyId: string | null
  error: RayError | null
  hydrate: () => Promise<void>
  apply: (id: string) => Promise<void>
  importPack: () => Promise<void>
  exportPack: (id?: string) => Promise<void>
  remove: (id: string) => Promise<void>
  clearError: () => void
}

export const useThemesStore = create<ThemesState>((set, get) => ({
  packs: [],
  ready: false,
  busyId: null,
  error: null,

  hydrate: async () => {
    try {
      set({ packs: await api.themes.list(), ready: true })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  apply: async (id) => {
    set({ busyId: id, error: null })
    try {
      await api.themes.apply(id)
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busyId: null })
    }
  },

  importPack: async () => {
    set({ busyId: '__import', error: null })
    try {
      await api.themes.importPack()
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busyId: null })
    }
  },

  exportPack: async (id) => {
    set({ busyId: id ?? '__export', error: null })
    try {
      await api.themes.exportPack(id)
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busyId: null })
    }
  },

  remove: async (id) => {
    set({ busyId: id, error: null })
    try {
      await api.themes.remove(id)
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busyId: null })
    }
  },

  clearError: () => set({ error: null })
}))
