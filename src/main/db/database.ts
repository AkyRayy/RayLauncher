import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { win32 as path } from 'node:path'
import { mkdirSync } from 'node:fs'
import { RayError } from '@shared/errors'
import { paths } from '../core/paths'
import { logger } from '../logger'

let db: DatabaseSync | null = null

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE profiles (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    icon         TEXT,
    game_version TEXT NOT NULL,
    loader_kind  TEXT NOT NULL DEFAULT 'vanilla',
    loader_ver   TEXT,
    version_id   TEXT,
    account_id   TEXT,
    java_json    TEXT NOT NULL DEFAULT '{"mode":"auto"}',
    memory_json  TEXT NOT NULL DEFAULT '{"auto":true,"minMb":2048,"maxMb":4096}',
    window_json  TEXT,
    jvm_args     TEXT NOT NULL DEFAULT '[]',
    game_args    TEXT NOT NULL DEFAULT '[]',
    offline_skins INTEGER NOT NULL DEFAULT 1,
    created      INTEGER NOT NULL,
    updated      INTEGER NOT NULL,
    last_played  INTEGER
  );

  CREATE TABLE mods (
    id           TEXT PRIMARY KEY,
    profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    source       TEXT NOT NULL,
    project_id   TEXT NOT NULL,
    version_id   TEXT NOT NULL,
    title        TEXT NOT NULL,
    slug         TEXT NOT NULL DEFAULT '',
    icon_url     TEXT,
    file_name    TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    sha1         TEXT NOT NULL DEFAULT '',
    sha512       TEXT,
    size         INTEGER NOT NULL DEFAULT 0,
    enabled      INTEGER NOT NULL DEFAULT 1,
    installed_at INTEGER NOT NULL
  );

  CREATE UNIQUE INDEX mods_profile_file ON mods(profile_id, file_name);
  CREATE INDEX mods_profile ON mods(profile_id);
  CREATE INDEX mods_project ON mods(profile_id, source, project_id);

  CREATE TABLE cache_kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  `,
  `
  ALTER TABLE mods ADD COLUMN kind TEXT NOT NULL DEFAULT 'mod';
  ALTER TABLE mods ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE mods ADD COLUMN previous_json TEXT;

  CREATE TABLE profile_stats (
    profile_id   TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    launches     INTEGER NOT NULL DEFAULT 0,
    crashes      INTEGER NOT NULL DEFAULT 0,
    playtime_ms  INTEGER NOT NULL DEFAULT 0,
    last_exit_at INTEGER
  );

  CREATE TABLE servers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    address    TEXT NOT NULL,
    port       INTEGER NOT NULL DEFAULT 25565,
    favorite   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX servers_order ON servers(favorite DESC, name COLLATE NOCASE);
  `
]

export function initDatabase(): DatabaseSync {
  if (db) return db

  const file = path.join(paths().userData, 'raylauncher.db')
  mkdirSync(paths().userData, { recursive: true })

  try {
    db = new DatabaseSync(file)
  } catch (error) {
    throw new RayError('INTERNAL', 'Не удалось открыть базу данных лаунчера', {
      file,
      cause: error instanceof Error ? error.message : String(error)
    })
  }

  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')

  migrate(db)
  return db
}

function migrate(instance: DatabaseSync): void {
  const row = instance.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined
  const current = Number(row?.user_version ?? 0)

  if (current > MIGRATIONS.length) {
    throw new RayError(
      'INTERNAL',
      `База создана более новой версией лаунчера (схема ${current}) — обновите RayLauncher`
    )
  }

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version]
    if (!sql) continue

    logger.info(`Миграция базы данных до версии ${version + 1}`)
    instance.exec('BEGIN')
    try {
      instance.exec(sql)
      instance.exec(`PRAGMA user_version = ${version + 1}`)
      instance.exec('COMMIT')
    } catch (error) {
      instance.exec('ROLLBACK')
      throw new RayError('INTERNAL', `Миграция базы до версии ${version + 1} не удалась`, {
        cause: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

export function database(): DatabaseSync {
  if (!db) return initDatabase()
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}

const statements = new Map<string, StatementSync>()

export function statement(sql: string): StatementSync {
  const cached = statements.get(sql)
  if (cached) return cached

  const prepared = database().prepare(sql)
  statements.set(sql, prepared)
  return prepared
}

export function transaction<T>(work: () => T): T {
  const instance = database()
  instance.exec('BEGIN')
  try {
    const result = work()
    instance.exec('COMMIT')
    return result
  } catch (error) {
    instance.exec('ROLLBACK')
    throw error
  }
}
