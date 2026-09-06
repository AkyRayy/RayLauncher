import { win32 as path } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Account, AccountKind, PublicAccount } from '@shared/types'
import { RayError } from '@shared/errors'
import { readJson, writeJson } from '../core/fsx'
import { paths } from '../core/paths'
import { deleteSecret, getSecret, SECRET_KEYS, setSecret } from '../store/secrets'
import { logger } from '../logger'

interface StoredAccount extends Omit<Account, 'accessToken' | 'refreshToken'> {
  hasAccessToken: boolean
}

interface AccountsFile {
  accounts: StoredAccount[]
  activeId: string | null
  guestNicknames: string[]
}

const EMPTY: AccountsFile = { accounts: [], activeId: null, guestNicknames: [] }

let cache: AccountsFile | null = null

function file(): string {
  return path.join(paths().userData, 'accounts.json')
}

async function load(): Promise<AccountsFile> {
  if (cache) return cache
  cache = (await readJson<AccountsFile>(file())) ?? { ...EMPTY }
  return cache
}

async function persist(): Promise<void> {
  if (cache) await writeJson(file(), cache)
}

export async function listAccounts(): Promise<PublicAccount[]> {
  const store = await load()
  const now = Date.now()

  return store.accounts.map((account) => ({
    ...toPublic(account),
    expired: account.expiresAt !== undefined && account.expiresAt <= now
  }))
}

export async function activeAccountId(): Promise<string | null> {
  return (await load()).activeId
}

export async function getAccount(accountId: string): Promise<Account | null> {
  const store = await load()
  const stored = store.accounts.find((item) => item.id === accountId)
  if (!stored) return null

  const accessToken =
    (await getSecret(tokenKey(stored.kind, stored.id))) ?? (stored.kind === 'guest' ? stored.uuid : '')
  const refreshToken = await getSecret(SECRET_KEYS.msRefresh(stored.id))

  return {
    ...omitInternals(stored),
    ...(stored.clientToken ? { clientToken: stored.clientToken } : {}),
    accessToken,
    ...(refreshToken ? { refreshToken } : {})
  }
}

export async function getActiveAccount(): Promise<Account | null> {
  const id = await activeAccountId()
  return id ? getAccount(id) : null
}

export interface SaveAccountInput {
  kind: AccountKind
  username: string
  uuid: string
  accessToken: string
  refreshToken?: string
  clientToken?: string
  xuid?: string
  expiresAt?: number
  skin?: Account['skin']
  capeUrl?: string
  yggdrasil?: Account['yggdrasil']
}

export async function saveAccount(input: SaveAccountInput): Promise<PublicAccount> {
  const store = await load()
  const now = Date.now()

  const existing = store.accounts.find(
    (item) => item.kind === input.kind && item.uuid.toLowerCase() === input.uuid.toLowerCase()
  )

  const id = existing?.id ?? `${input.kind}-${randomUUID().slice(0, 12)}`

  const stored: StoredAccount = {
    id,
    kind: input.kind,
    username: input.username,
    uuid: input.uuid,
    hasAccessToken: input.accessToken.length > 0,
    createdAt: existing?.createdAt ?? now,
    lastUsedAt: now,
    ...(input.clientToken ? { clientToken: input.clientToken } : {}),
    ...(input.xuid ? { xuid: input.xuid } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(input.skin ? { skin: input.skin } : {}),
    ...(input.capeUrl ? { capeUrl: input.capeUrl } : {}),
    ...(input.yggdrasil ? { yggdrasil: input.yggdrasil } : {})
  }

  store.accounts = [...store.accounts.filter((item) => item.id !== id), stored]
  store.activeId ??= id

  if (input.accessToken.length > 0) await setSecret(tokenKey(input.kind, id), input.accessToken)
  if (input.refreshToken) await setSecret(SECRET_KEYS.msRefresh(id), input.refreshToken)

  await persist()
  logger.info(`Аккаунт сохранён: ${input.username} (${input.kind})`)

  return { ...toPublic(stored), expired: false }
}

export async function updateTokens(
  accountId: string,
  tokens: { accessToken: string; refreshToken?: string; expiresAt?: number }
): Promise<void> {
  const store = await load()
  const stored = store.accounts.find((item) => item.id === accountId)
  if (!stored) return

  stored.hasAccessToken = tokens.accessToken.length > 0
  if (tokens.expiresAt) stored.expiresAt = tokens.expiresAt
  stored.lastUsedAt = Date.now()

  await setSecret(tokenKey(stored.kind, accountId), tokens.accessToken)
  if (tokens.refreshToken) await setSecret(SECRET_KEYS.msRefresh(accountId), tokens.refreshToken)
  await persist()
}

export async function updateProfileInfo(
  accountId: string,
  patch: { username?: string; skin?: Account['skin']; capeUrl?: string }
): Promise<void> {
  const store = await load()
  const stored = store.accounts.find((item) => item.id === accountId)
  if (!stored) return

  if (patch.username) stored.username = patch.username
  if (patch.skin) stored.skin = patch.skin
  if (patch.capeUrl !== undefined) stored.capeUrl = patch.capeUrl
  await persist()
}

export async function setActiveAccount(accountId: string): Promise<void> {
  const store = await load()
  if (!store.accounts.some((item) => item.id === accountId)) {
    throw new RayError('ACCOUNT_NOT_FOUND', 'Аккаунт не найден', { accountId })
  }
  store.activeId = accountId
  await persist()
}

export async function removeAccount(accountId: string): Promise<void> {
  const store = await load()
  const stored = store.accounts.find((item) => item.id === accountId)
  if (!stored) return

  store.accounts = store.accounts.filter((item) => item.id !== accountId)
  if (store.activeId === accountId) store.activeId = store.accounts[0]?.id ?? null

  await deleteSecret(tokenKey(stored.kind, accountId))
  await deleteSecret(SECRET_KEYS.msRefresh(accountId))
  await persist()

  logger.info(`Аккаунт удалён: ${stored.username}`)
}

export async function guestNicknames(): Promise<string[]> {
  return (await load()).guestNicknames
}

export async function rememberGuestNickname(nickname: string): Promise<void> {
  const store = await load()
  store.guestNicknames = [nickname, ...store.guestNicknames.filter((item) => item !== nickname)].slice(0, 8)
  await persist()
}

function tokenKey(kind: AccountKind, accountId: string): string {
  return kind === 'yggdrasil' ? SECRET_KEYS.yggdrasilToken(accountId) : `mc.token.${accountId}`
}

function toPublic(stored: StoredAccount): Omit<PublicAccount, 'expired'> {
  return omitInternals(stored)
}

function omitInternals(stored: StoredAccount): Omit<PublicAccount, 'expired'> {
  const copy: Partial<StoredAccount> = { ...stored }
  delete copy.hasAccessToken
  delete copy.clientToken
  return copy as Omit<PublicAccount, 'expired'>
}
