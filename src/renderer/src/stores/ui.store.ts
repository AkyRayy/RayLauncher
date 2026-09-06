import { create } from 'zustand'

interface UiState {
  consoleOpen: boolean
  setConsoleOpen: (open: boolean) => void
  toggleConsole: () => void
}

export const useUiStore = create<UiState>((set, get) => ({
  consoleOpen: false,
  setConsoleOpen: (open) => set({ consoleOpen: open }),
  toggleConsole: () => set({ consoleOpen: !get().consoleOpen })
}))
