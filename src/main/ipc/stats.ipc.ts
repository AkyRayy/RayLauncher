import { handle } from './registry'
import { listStats } from '../db/stats.repo'

export function registerStatsIpc(): void {
  handle('stats:list', () => listStats())
}
