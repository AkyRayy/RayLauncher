import { create } from 'zustand'
import type { DownloadTask } from '@shared/types'
import { api } from '@renderer/lib/api'

interface DownloadsState {
  tasks: Map<string, DownloadTask>
  load: () => Promise<void>
  apply: (task: DownloadTask) => void
  clearFinished: () => Promise<void>
}

export const useDownloadsStore = create<DownloadsState>((set) => ({
  tasks: new Map(),

  load: async () => {
    const list = await api.downloads.list()
    set({ tasks: new Map(list.map((task) => [task.id, task])) })
  },

  apply: (task) =>
    set((state) => {
      const tasks = new Map(state.tasks)
      tasks.set(task.id, task)
      return { tasks }
    }),

  clearFinished: async () => {
    await api.downloads.clearFinished()
    set((state) => {
      const tasks = new Map(state.tasks)
      for (const [id, task] of tasks) {
        if (task.state === 'done' || task.state === 'error') tasks.delete(id)
      }
      return { tasks }
    })
  }
}))

api.on['download:progress']((task) => {
  useDownloadsStore.getState().apply(task)
})

export function useActiveDownloadsCount(): number {
  return useDownloadsStore(
    (state) =>
      [...state.tasks.values()].filter(
        (task) => task.state === 'running' || task.state === 'queued' || task.state === 'paused'
      ).length
  )
}

export function totalSpeed(tasks: Iterable<DownloadTask>): number {
  let total = 0
  for (const task of tasks) {
    if (task.state === 'running') total += task.speedBps ?? 0
  }
  return total
}
