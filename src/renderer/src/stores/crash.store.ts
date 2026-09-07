import { create } from 'zustand'
import type { CrashFixId, CrashFixResult, CrashVerdict } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

interface CrashState {
  verdict: CrashVerdict | null
  open: boolean
  busyFix: CrashFixId | null
  sending: boolean
  sent: boolean
  lastResult: CrashFixResult | null
  error: RayError | null
  load: (profileId?: string) => Promise<void>
  setOpen: (open: boolean) => void
  applyFix: (profileId: string | undefined, fixId: CrashFixId) => Promise<void>
  sendReport: (profileId?: string) => Promise<void>
  clear: () => void
}

export const useCrashStore = create<CrashState>((set) => ({
  verdict: null,
  open: false,
  busyFix: null,
  sending: false,
  sent: false,
  lastResult: null,
  error: null,

  load: async (profileId) => {
    set({ error: null })
    try {
      const verdict = await api.crash.verdict(profileId)
      set({ verdict, sent: false, lastResult: null })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    }
  },

  setOpen: (open) => set({ open }),

  applyFix: async (profileId, fixId) => {
    set({ busyFix: fixId, error: null, lastResult: null })
    try {
      const result = await api.crash.applyFix({ profileId, fixId })
      set({ lastResult: result })
      if (result.applied) {
        const verdict = await api.crash.verdict(profileId)
        set({ verdict })
      }
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ busyFix: null })
    }
  },

  sendReport: async (profileId) => {
    set({ sending: true, error: null })
    try {
      const result = await api.crash.sendReport(profileId)
      set({ sent: result.sent })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL') })
    } finally {
      set({ sending: false })
    }
  },

  clear: () => set({ verdict: null, open: false, lastResult: null, error: null, sent: false })
}))
