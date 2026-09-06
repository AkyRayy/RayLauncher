import { statement } from './database'
import { logger } from '../logger'

export function readCache<T>(key: string): T | null {
  const row = statement('SELECT value, expires_at FROM cache_kv WHERE key = ?').get(key) as
    | { value: string; expires_at: number }
    | undefined

  if (!row) return null
  if (row.expires_at <= Date.now()) {
    statement('DELETE FROM cache_kv WHERE key = ?').run(key)
    return null
  }

  try {
    return JSON.parse(row.value) as T
  } catch {
    logger.warn(`Кэш «${key}» повреждён, удаляю`)
    statement('DELETE FROM cache_kv WHERE key = ?').run(key)
    return null
  }
}

export function writeCache(key: string, value: unknown, ttlMs: number): void {
  statement(`
    INSERT INTO cache_kv (key, value, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
  `).run(key, JSON.stringify(value), Date.now() + ttlMs)
}

export function readStaleCache<T>(key: string): T | null {
  const row = statement('SELECT value FROM cache_kv WHERE key = ?').get(key) as
    | { value: string }
    | undefined

  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export function dropCache(prefix: string): void {
  statement('DELETE FROM cache_kv WHERE key LIKE ?').run(`${prefix}%`)
}

export function pruneExpiredCache(): void {
  statement('DELETE FROM cache_kv WHERE expires_at <= ?').run(Date.now())
}
