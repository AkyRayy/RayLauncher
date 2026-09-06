import type { RayApi } from '@shared/ipc'
import { createMockApi } from './mockApi'

export const api: RayApi = window.ray ?? createMockApi()

export const isMockApi = window.ray === undefined
