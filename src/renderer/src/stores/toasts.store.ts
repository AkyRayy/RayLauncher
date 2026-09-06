import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'warning' | 'danger'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  body?: string
  action?: { label: string; run: () => void }
  timeoutMs: number
}

interface ToastsState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id' | 'timeoutMs'> & { timeoutMs?: number }) => string
  dismiss: (id: string) => void
  clear: () => void
}

const DEFAULT_TIMEOUT: Record<ToastTone, number> = {
  info: 4500,
  success: 4000,
  warning: 8000,
  danger: 0
}

const MAX_VISIBLE = 3

export const useToastsStore = create<ToastsState>((set, get) => ({
  toasts: [],

  push: ({ tone, title, body, action, timeoutMs }) => {
    const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const toast: Toast = {
      id,
      tone,
      title,
      ...(body ? { body } : {}),
      ...(action ? { action } : {}),
      timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT[tone]
    }

    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }))

    if (toast.timeoutMs > 0) {
      setTimeout(() => get().dismiss(id), toast.timeoutMs)
    }
    return id
  },

  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  clear: () => set({ toasts: [] })
}))

export const toast = {
  info: (title: string, body?: string) => useToastsStore.getState().push({ tone: 'info', title, ...(body ? { body } : {}) }),
  success: (title: string, body?: string) =>
    useToastsStore.getState().push({ tone: 'success', title, ...(body ? { body } : {}) }),
  warning: (title: string, body?: string) =>
    useToastsStore.getState().push({ tone: 'warning', title, ...(body ? { body } : {}) }),
  danger: (title: string, body?: string) =>
    useToastsStore.getState().push({ tone: 'danger', title, ...(body ? { body } : {}) })
}
