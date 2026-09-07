import { create } from 'zustand'
import type { BoostResult, PerfPreset, PerfPresetId } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

interface PerfState {
  presets: PerfPreset[]
  ready: boolean
  applying: boolean
  boosting: boolean
  lastBoost: BoostResult | null
  error: RayError | null
  load: () => Promise<void>
  apply: (profileId: string, preset: PerfPresetId) => Promise<boolean>
  boost: (profileId: string) => Promise<void>
  clearBoost: () => void
}

export const usePerfStore = create<PerfState>((set) => ({
  presets: [],
  ready: false,
  applying: false,
  boosting: false,
  lastBoost: null,
  error: null,

  load: async () => {
    try {
      set({ presets: await api.perf.presets(), ready: true })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  apply: async (profileId, preset) => {
    set({ applying: true, error: null })
    try {
      await api.perf.apply({ profileId, preset })
      return true
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
      return false
    } finally {
      set({ applying: false })
    }
  },

  boost: async (profileId) => {
    set({ boosting: true, error: null, lastBoost: null })
    try {
      set({ lastBoost: await api.perf.boost(profileId) })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ boosting: false })
    }
  },

  clearBoost: () => set({ lastBoost: null })
}))
