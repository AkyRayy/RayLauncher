import { create } from 'zustand'
import type { PublicAccount } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

interface PendingChoice {
  pendingId: string
  profiles: Array<{ id: string; name: string }>
}

interface AccountsState {
  accounts: PublicAccount[]
  activeId: string | null
  ready: boolean
  busy: 'microsoft' | 'guest' | 'yggdrasil' | 'refresh' | 'skin' | null
  error: RayError | null
  pending: PendingChoice | null
  skins: Record<string, string>
  hydrate: () => Promise<void>
  signInMicrosoft: () => Promise<void>
  cancelSignIn: () => Promise<void>
  addGuest: (nickname: string) => Promise<void>
  signInYggdrasil: (input: {
    apiRoot: string
    username: string
    password: string
    serverName?: string
  }) => Promise<void>
  chooseProfile: (profileId: string) => Promise<void>
  setActive: (accountId: string) => Promise<void>
  remove: (accountId: string) => Promise<void>
  refresh: (accountId: string) => Promise<void>
  loadSkin: (accountId: string) => Promise<void>
  importSkin: (accountId: string, variant: 'classic' | 'slim') => Promise<void>
  clearError: () => void
  dismissPending: () => void
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  activeId: null,
  ready: false,
  busy: null,
  error: null,
  pending: null,
  skins: {},

  hydrate: async () => {
    const [accounts, activeId] = await Promise.all([api.accounts.list(), api.accounts.active()])
    set({ accounts, activeId, ready: true })
    if (activeId) void get().loadSkin(activeId)
  },

  signInMicrosoft: async () => {
    set({ busy: 'microsoft', error: null })
    try {
      const account = await api.accounts.signInMicrosoft()
      await get().hydrate()
      await get().setActive(account.id)
      void get().loadSkin(account.id)
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: null })
    }
  },

  cancelSignIn: async () => {
    await api.accounts.cancelSignIn()
    set({ busy: null })
  },

  addGuest: async (nickname) => {
    set({ busy: 'guest', error: null })
    try {
      const account = await api.accounts.addGuest(nickname)
      await get().hydrate()
      await get().setActive(account.id)
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: null })
    }
  },

  signInYggdrasil: async (input) => {
    set({ busy: 'yggdrasil', error: null })
    try {
      const result = await api.accounts.signInYggdrasil(input)
      if (result.pendingId) {
        set({ pending: { pendingId: result.pendingId, profiles: result.profiles } })
      } else if (result.account) {
        await get().hydrate()
        await get().setActive(result.account.id)
      }
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: null })
    }
  },

  chooseProfile: async (profileId) => {
    const pending = get().pending
    if (!pending) return

    set({ busy: 'yggdrasil', error: null })
    try {
      const account = await api.accounts.chooseYggdrasilProfile({ pendingId: pending.pendingId, profileId })
      set({ pending: null })
      await get().hydrate()
      await get().setActive(account.id)
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: null })
    }
  },

  setActive: async (accountId) => {
    set({ activeId: accountId })
    await api.accounts.setActive(accountId)
    void get().loadSkin(accountId)
  },

  remove: async (accountId) => {
    await api.accounts.remove(accountId)
    const skins = { ...get().skins }
    delete skins[accountId]
    set({ skins })
    await get().hydrate()
  },

  refresh: async (accountId) => {
    set({ busy: 'refresh', error: null })
    try {
      await api.accounts.refresh(accountId)
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: null })
    }
  },

  loadSkin: async (accountId) => {
    if (get().skins[accountId]) return
    const result = await api.accounts.skin(accountId).catch(() => null)
    if (result?.dataUrl) set({ skins: { ...get().skins, [accountId]: result.dataUrl } })
  },

  importSkin: async (accountId, variant) => {
    set({ busy: 'skin', error: null })
    try {
      const result = await api.accounts.importSkin({ accountId, variant })
      if (result.dataUrl) set({ skins: { ...get().skins, [accountId]: result.dataUrl } })
      await get().hydrate()
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busy: null })
    }
  },

  clearError: () => set({ error: null }),
  dismissPending: () => set({ pending: null })
}))

api.on['accounts:changed']((accounts) => {
  useAccountsStore.setState({ accounts })
})

export function useActiveAccount(): PublicAccount | null {
  return useAccountsStore(
    (state) => state.accounts.find((account) => account.id === state.activeId) ?? null
  )
}
