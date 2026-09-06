import { create } from 'zustand'
import type { VersionCatalog, VersionSummary } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

interface VersionsState {
  catalog: VersionCatalog | null
  loading: boolean
  error: RayError | null
  installing: string | null
  load: (refresh?: boolean) => Promise<void>
  install: (versionId: string) => Promise<void>
  cancel: (versionId: string) => Promise<void>
}

export const useVersionsStore = create<VersionsState>((set, get) => ({
  catalog: null,
  loading: false,
  error: null,
  installing: null,

  load: async (refresh = false) => {
    set({ loading: true, error: null })
    try {
      const catalog = await api.versions.list(refresh)
      set({ catalog, loading: false })
    } catch (error) {
      set({ error: RayError.from(error), loading: false })
    }
  },

  install: async (versionId) => {
    set({ installing: versionId, error: null })
    try {
      await api.install.version(versionId)
      await get().load(false)
    } catch (error) {
      set({ error: RayError.from(error) })
    } finally {
      set({ installing: null })
    }
  },

  cancel: async (versionId) => {
    await api.install.cancel(versionId)
    set({ installing: null })
  }
}))

export function filterVersions(
  versions: VersionSummary[],
  query: string,
  type: 'release' | 'snapshot' | 'all'
): VersionSummary[] {
  const needle = query.trim().toLowerCase()
  return versions.filter((version) => {
    if (type === 'release' && version.type !== 'release') return false
    if (type === 'snapshot' && version.type === 'release') return false
    return needle.length === 0 || version.id.toLowerCase().includes(needle)
  })
}
