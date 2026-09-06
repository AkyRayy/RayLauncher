import type { RayApi } from '@shared/ipc'

declare global {
  interface Window {
    ray?: RayApi
  }
}

export {}
