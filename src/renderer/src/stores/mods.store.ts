import { create } from 'zustand'
import type { LoaderKind, ModEntry, ModSearchHit, ModUpdateInfo, ModVersionInfo, ModSource } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

export type SortId = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'

interface ModsState {
  source: ModSource
  query: string
  sort: SortId
  hits: ModSearchHit[]
  total: number
  offset: number
  searching: boolean
  loadingMore: boolean
  searchError: RayError | null

  mods: ModEntry[]
  modsProfileId: string | null
  updates: ModUpdateInfo[]
  busyId: string | null
  scanning: boolean
  checkingUpdates: boolean
  error: RayError | null
  curseforgeReady: boolean

  setSource: (source: ModSource) => void
  setQuery: (query: string) => void
  setSort: (sort: SortId) => void
  search: (profileId: string | null) => Promise<void>
  loadMore: (profileId: string | null) => Promise<void>

  loadMods: (profileId: string) => Promise<void>
  applyChanged: (profileId: string, mods: ModEntry[]) => void
  install: (profileId: string, version: ModVersionInfo) => Promise<boolean>
  remove: (modId: string) => Promise<void>
  toggle: (modId: string, enabled: boolean) => Promise<void>
  scan: (profileId: string) => Promise<number>
  checkUpdates: (profileId: string) => Promise<void>
  applyUpdate: (update: ModUpdateInfo) => Promise<void>
  applyAllUpdates: (profileId: string) => Promise<number>
  openFolder: (profileId: string) => Promise<void>
  refreshCurseforge: () => Promise<void>
  clearError: () => void
}

const PAGE = 20

export const useModsStore = create<ModsState>((set, get) => ({
  source: 'modrinth',
  query: '',
  sort: 'relevance',
  hits: [],
  total: 0,
  offset: 0,
  searching: false,
  loadingMore: false,
  searchError: null,

  mods: [],
  modsProfileId: null,
  updates: [],
  busyId: null,
  scanning: false,
  checkingUpdates: false,
  error: null,
  curseforgeReady: false,

  setSource: (source) => set({ source, hits: [], offset: 0, total: 0 }),
  setQuery: (query) => set({ query }),
  setSort: (sort) => set({ sort }),

  search: async (profileId) => {
    const { source, query, sort } = get()
    set({ searching: true, searchError: null })
    try {
      const result = await api.mods.search({
        source,
        query,
        sort,
        offset: 0,
        limit: PAGE,
        ...(profileId ? { profileId } : {})
      })
      set({ hits: result.hits, total: result.total, offset: result.hits.length })
    } catch (error) {
      set({ searchError: RayError.from(error), hits: [], total: 0, offset: 0 })
    } finally {
      set({ searching: false })
    }
  },

  loadMore: async (profileId) => {
    const { source, query, sort, offset, hits, total, loadingMore } = get()
    if (loadingMore || hits.length >= total) return

    set({ loadingMore: true })
    try {
      const result = await api.mods.search({
        source,
        query,
        sort,
        offset,
        limit: PAGE,
        ...(profileId ? { profileId } : {})
      })
      set({
        hits: [...hits, ...result.hits],
        total: result.total,
        offset: offset + result.hits.length
      })
    } catch (error) {
      set({ searchError: RayError.from(error) })
    } finally {
      set({ loadingMore: false })
    }
  },

  loadMods: async (profileId) => {
    const mods = await api.mods.list(profileId)
    set({ mods, modsProfileId: profileId })
  },

  applyChanged: (profileId, mods) => {
    if (get().modsProfileId !== profileId) return
    set({ mods })
  },

  install: async (profileId, version) => {
    set({ busyId: version.projectId, error: null })
    try {
      await api.mods.install({ profileId, version })
      set((state) => ({
        hits: state.hits.map((hit) =>
          hit.projectId === version.projectId ? { ...hit, installed: true } : hit
        )
      }))
      return true
    } catch (error) {
      set({ error: RayError.from(error) })
      return false
    } finally {
      set({ busyId: null })
    }
  },

  remove: async (modId) => {
    set({ busyId: modId, error: null })
    try {
      const removed = get().mods.find((mod) => mod.id === modId)
      await api.mods.remove({ modId })
      if (removed) {
        set((state) => ({
          hits: state.hits.map((hit) =>
            hit.projectId === removed.projectId ? { ...hit, installed: false } : hit
          )
        }))
      }
    } catch (error) {
      set({ error: RayError.from(error) })
    } finally {
      set({ busyId: null })
    }
  },

  toggle: async (modId, enabled) => {
    set({ busyId: modId, error: null })
    try {
      await api.mods.toggle({ modId, enabled })
    } catch (error) {
      set({ error: RayError.from(error) })
    } finally {
      set({ busyId: null })
    }
  },

  scan: async (profileId) => {
    set({ scanning: true, error: null })
    try {
      const added = await api.mods.scan(profileId)
      return added.length
    } catch (error) {
      set({ error: RayError.from(error) })
      return 0
    } finally {
      set({ scanning: false })
    }
  },

  checkUpdates: async (profileId) => {
    set({ checkingUpdates: true, error: null })
    try {
      set({ updates: await api.mods.updates(profileId) })
    } catch (error) {
      set({ error: RayError.from(error) })
    } finally {
      set({ checkingUpdates: false })
    }
  },

  applyUpdate: async (update) => {
    set({ busyId: update.modId, error: null })
    try {
      await api.mods.update({ modId: update.modId, version: update.next })
      set((state) => ({ updates: state.updates.filter((item) => item.modId !== update.modId) }))
    } catch (error) {
      set({ error: RayError.from(error) })
    } finally {
      set({ busyId: null })
    }
  },

  applyAllUpdates: async (profileId) => {
    set({ checkingUpdates: true, error: null })
    try {
      const result = await api.mods.updateAll(profileId)
      set({ updates: [] })
      return result.updated
    } catch (error) {
      set({ error: RayError.from(error) })
      return 0
    } finally {
      set({ checkingUpdates: false })
    }
  },

  openFolder: async (profileId) => {
    await api.mods.openFolder(profileId)
  },

  refreshCurseforge: async () => {
    set({ curseforgeReady: await api.mods.curseforgeReady() })
  },

  clearError: () => set({ error: null, searchError: null })
}))

api.on['mods:changed'](({ profileId, mods }) => {
  useModsStore.getState().applyChanged(profileId, mods)
})

export function supportsMods(kind: LoaderKind): boolean {
  return kind !== 'vanilla'
}
