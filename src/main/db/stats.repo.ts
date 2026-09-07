import type { ProfileStats } from '@shared/types'
import { statement } from './database'

interface StatsRow {
  profile_id: string
  launches: number
  crashes: number
  playtime_ms: number
  last_exit_at: number | null
}

const EMPTY: Omit<ProfileStats, 'profileId'> = { launches: 0, crashes: 0, playtimeMs: 0 }

export function listStats(): ProfileStats[] {
  const rows = statement('SELECT profile_id, launches, crashes, playtime_ms, last_exit_at FROM profile_stats').all() as unknown as StatsRow[]
  return rows.map(toStats)
}

export function getStats(profileId: string): ProfileStats {
  const row = statement(
    'SELECT profile_id, launches, crashes, playtime_ms, last_exit_at FROM profile_stats WHERE profile_id = ?'
  ).get(profileId) as unknown as StatsRow | undefined
  return row ? toStats(row) : { ...EMPTY, profileId }
}

/** Вызывается при старте игры: +1 запуск. */
export function recordLaunch(profileId: string): void {
  statement(`
    INSERT INTO profile_stats (profile_id, launches, crashes, playtime_ms, last_exit_at)
    VALUES (?, 1, 0, 0, NULL)
    ON CONFLICT(profile_id) DO UPDATE SET launches = launches + 1
  `).run(profileId)
}

/** Вызывается при выходе: время сессии, при краше — +1 к счётчику падений. */
export function recordExit(profileId: string, sessionMs: number, crashed: boolean): void {
  statement(`
    INSERT INTO profile_stats (profile_id, launches, crashes, playtime_ms, last_exit_at)
    VALUES (?, 0, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      crashes = crashes + ?,
      playtime_ms = playtime_ms + ?,
      last_exit_at = ?
  `).run(profileId, crashed ? 1 : 0, Math.max(0, Math.round(sessionMs)), Date.now(), crashed ? 1 : 0, Math.max(0, Math.round(sessionMs)), Date.now())
}

function toStats(row: StatsRow): ProfileStats {
  return {
    profileId: row.profile_id,
    launches: row.launches,
    crashes: row.crashes,
    playtimeMs: row.playtime_ms,
    ...(row.last_exit_at ? { lastExitAt: row.last_exit_at } : {})
  }
}
