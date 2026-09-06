import type { BrowserWindow } from 'electron'
import type { IpcEventChannel, IpcEvents } from '@shared/ipc'

const windows = new Set<BrowserWindow>()

export function registerEventTarget(window: BrowserWindow): void {
  windows.add(window)
  window.on('closed', () => windows.delete(window))
}

export function emitEvent<E extends IpcEventChannel>(channel: E, payload: IpcEvents[E]): void {
  for (const window of windows) {
    if (window.isDestroyed()) {
      windows.delete(window)
      continue
    }
    window.webContents.send(channel, payload)
  }
}

export function hasEventTargets(): boolean {
  return windows.size > 0
}
