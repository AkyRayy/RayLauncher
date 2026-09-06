import { safeStorage } from 'electron'
import { win32 as path } from 'node:path'
import { readJson, writeJson } from '../core/fsx'
import { paths } from '../core/paths'
import { logger } from '../logger'

type SecretsFile = Record<string, string>

let cache: SecretsFile | null = null

function file(): string {
  return path.join(paths().userData, 'secrets.json')
}

async function load(): Promise<SecretsFile> {
  if (cache) return cache
  cache = (await readJson<SecretsFile>(file())) ?? {}
  return cache
}

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export async function setSecret(key: string, value: string): Promise<boolean> {
  if (!encryptionAvailable()) {
    logger.warn(`Шифрование недоступно, секрет «${key}» не сохранён`)
    return false
  }

  const store = await load()
  store[key] = safeStorage.encryptString(value).toString('base64')
  await writeJson(file(), store)
  return true
}

export async function getSecret(key: string): Promise<string | null> {
  const store = await load()
  const encoded = store[key]
  if (!encoded) return null

  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    logger.warn(`Секрет «${key}» не расшифровывается, удаляю`)
    await deleteSecret(key)
    return null
  }
}

export async function deleteSecret(key: string): Promise<void> {
  const store = await load()
  if (!(key in store)) return
  delete store[key]
  await writeJson(file(), store)
}

export async function hasSecret(key: string): Promise<boolean> {
  const store = await load()
  return Object.hasOwn(store, key)
}

export const SECRET_KEYS = {
  msRefresh: (accountId: string) => `ms.refresh.${accountId}`,
  yggdrasilToken: (accountId: string) => `ygg.token.${accountId}`,
  curseforge: 'curseforge.apiKey'
} as const
