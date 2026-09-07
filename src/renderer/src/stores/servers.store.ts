import { create } from 'zustand'
import type { GameServer, ServerStatus } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

interface ServersState {
  servers: GameServer[]
  statuses: Record<string, ServerStatus>
  ready: boolean
  busy: boolean
  pinging: string | null
  error: RayError | null
  hydrate: () => Promise<void>
  add: (input: { name: string; address: string; port?: number }) => Promise<GameServer | null>
  update: (id: string, patch: { name?: string; address?: string; port?: number; favorite?: boolean }) => Promise<void>
  remove: (id: string) => Promise<void>
  ping: (id: string) => Promise<void>
  pingAll: () => Promise<void>
  connect: (serverId: string, profileId: string) => Promise<boolean>
  clearError: () => void
}

export const useServersStore = create<ServersState>((set, get) => ({
  servers: [],
  statuses: {},
  ready: false,
  busy: false,
  pinging: null,
  error: null,

  hydrate: async () => {
    try {
      set({ servers: await api.servers.list(), ready: true })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  add: async (input) => {
    set({ busy: true, error: null })
    try {
      const server = await api.servers.add(input)
      set({ servers: [...get().servers, server] })
      return server
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
      return null
    } finally {
      set({ busy: false })
    }
  },

  update: async (id, patch) => {
    set({ error: null })
    try {
      const server = await api.servers.update({ id, patch })
      set({ servers: get().servers.map((item) => (item.id === id ? server : item)) })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  remove: async (id) => {
    set({ error: null })
    try {
      await api.servers.remove(id)
      const statuses = { ...get().statuses }
      delete statuses[id]
      set({ servers: get().servers.filter((item) => item.id !== id), statuses })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  ping: async (id) => {
    set({ pinging: id })
    try {
      const status = await api.servers.ping(id)
      set({ statuses: { ...get().statuses, [id]: status } })
    } catch {
      set({ statuses: { ...get().statuses, [id]: { online: false } } })
    } finally {
      set({ pinging: null })
    }
  },

  pingAll: async () => {
    set({ busy: true })
    try {
      set({ statuses: await api.servers.pingAll() })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: false })
    }
  },

  connect: async (serverId, profileId) => {
    set({ error: null })
    try {
      await api.servers.connect({ serverId, profileId })
      return true
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
      return false
    }
  },

  clearError: () => set({ error: null })
}))
