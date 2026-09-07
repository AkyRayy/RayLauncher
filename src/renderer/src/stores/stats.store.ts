import { create } from 'zustand'
import type { ProfileStats } from '@shared/types'
import { api } from '@renderer/lib/api'

interface StatsState {
  stats: ProfileStats[]
  ready: boolean
  hydrate: () => Promise<void>
}

export const useStatsStore = create<StatsState>((set) => ({
  stats: [],
  ready: false,

  hydrate: async () => {
    try {
      set({ stats: await api.stats.list(), ready: true })
    } catch {
      set({ ready: true })
    }
  }
}))

export function useProfileStats(profileId: string): ProfileStats | null {
  return useStatsStore((state) => state.stats.find((item) => item.profileId === profileId) ?? null)
}
