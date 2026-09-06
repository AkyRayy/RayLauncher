import { create } from 'zustand'
import type { GameState, InstallStage, LogLine } from '@shared/types'
import { RayError } from '@shared/errors'
import { api } from '@renderer/lib/api'

const LOG_LIMIT = 800

interface LaunchState {
  game: GameState | null
  stage: InstallStage | null
  busy: boolean
  log: LogLine[]
  error: RayError | null
  hydrate: () => Promise<void>
  launch: (versionId: string, nickname: string) => Promise<void>
  launchProfile: (profileId: string) => Promise<void>
  stop: () => Promise<void>
  clearError: () => void
  clearLog: () => void
}

export const useLaunchStore = create<LaunchState>((set, get) => ({
  game: null,
  stage: null,
  busy: false,
  log: [],
  error: null,

  hydrate: async () => {
    const game = await api.game.state()
    if (game) set({ game, busy: isBusyPhase(game.phase) })
  },

  launch: async (versionId, nickname) => {
    set({ error: null, log: [], busy: true })
    try {
      const game = await api.game.launch({ versionId, nickname })
      set({ game })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL'), busy: false, stage: null })
    }
  },

  launchProfile: async (profileId) => {
    set({ error: null, log: [], busy: true })
    try {
      const game = await api.profiles.launch(profileId)
      set({ game })
    } catch (error) {
      set({ error: RayError.from(error, 'INTERNAL'), busy: false, stage: null })
    }
  },

  stop: async () => {
    const profileId = get().game?.profileId
    if (!profileId) return
    await api.game.stop(profileId)
  },

  clearError: () => set({ error: null }),
  clearLog: () => set({ log: [] })
}))

api.on['game:state']((game) => {
  useLaunchStore.setState({
    game,
    busy: isBusyPhase(game.phase),
    stage: game.phase === 'preparing' || game.phase === 'downloading' ? useLaunchStore.getState().stage : null
  })
})

api.on['install:stage']((stage) => {
  useLaunchStore.setState({ stage, busy: stage.stage !== 'done' })
})

api.on['game:log']((line) => {
  const log = useLaunchStore.getState().log
  const next = log.length >= LOG_LIMIT ? [...log.slice(log.length - LOG_LIMIT + 1), line] : [...log, line]
  useLaunchStore.setState({ log: next })
})

function isBusyPhase(phase: GameState['phase']): boolean {
  return phase === 'preparing' || phase === 'downloading' || phase === 'launching' || phase === 'running'
}

export function useGameRunning(): boolean {
  return useLaunchStore((state) => state.game?.phase === 'running' || state.game?.phase === 'launching')
}
