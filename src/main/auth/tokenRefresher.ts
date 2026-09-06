import { RayError } from '@shared/errors'
import type { Account } from '@shared/types'
import { getSettings } from '../store/settings.store'
import { logger } from '../logger'
import { getAccount, listAccounts, updateProfileInfo, updateTokens } from './accountManager'
import { refreshMicrosoftTokens } from './microsoft'
import { authenticateWithXbox, authorizeXsts, xboxAuthorizationHeader } from './xbox'
import { fetchProfile, loginWithXbox } from './minecraftServices'
import { refreshSession, validate, type YggdrasilSession } from './yggdrasil'
import { getSecret, SECRET_KEYS } from '../store/secrets'

export const REFRESH_MARGIN_MS = 5 * 60 * 1000

export function needsRefresh(expiresAt: number | undefined, now = Date.now()): boolean {
  if (expiresAt === undefined) return false
  return expiresAt - now <= REFRESH_MARGIN_MS
}

export async function ensureFreshAccount(accountId: string): Promise<Account> {
  const account = await getAccount(accountId)
  if (!account) throw new RayError('ACCOUNT_NOT_FOUND', 'Аккаунт не найден', { accountId })

  if (account.kind === 'guest') return account
  if (!needsRefresh(account.expiresAt)) return account

  return account.kind === 'microsoft' ? refreshMicrosoftAccount(account) : refreshYggdrasilAccount(account)
}

async function refreshMicrosoftAccount(account: Account): Promise<Account> {
  if (!account.refreshToken) {
    throw new RayError('MS_CANCELLED', 'Сессия Microsoft истекла — войдите заново', {
      accountId: account.id
    })
  }

  logger.info(`Обновляю сессию Microsoft для ${account.username}`)

  const microsoft = await refreshMicrosoftTokens(getSettings().msClientId, account.refreshToken)
  const xbl = await authenticateWithXbox(microsoft.accessToken)
  const xsts = await authorizeXsts(xbl.token)
  const minecraft = await loginWithXbox(xboxAuthorizationHeader(xsts))

  await updateTokens(account.id, {
    accessToken: minecraft.accessToken,
    refreshToken: microsoft.refreshToken,
    expiresAt: minecraft.expiresAt
  })

  const profile = await fetchProfile(minecraft.accessToken).catch(() => null)
  if (profile) {
    await updateProfileInfo(account.id, {
      username: profile.name,
      ...(profile.skin ? { skin: profile.skin } : {}),
      ...(profile.capeUrl ? { capeUrl: profile.capeUrl } : {})
    })
  }

  return {
    ...account,
    accessToken: minecraft.accessToken,
    refreshToken: microsoft.refreshToken,
    expiresAt: minecraft.expiresAt,
    ...(profile ? { username: profile.name } : {}),
    ...(profile?.skin ? { skin: profile.skin } : {})
  }
}

async function refreshYggdrasilAccount(account: Account): Promise<Account> {
  if (!account.yggdrasil || !account.clientToken) {
    throw new RayError('ACCOUNT_NOT_FOUND', 'Данные Yggdrasil-сервера потеряны — войдите заново')
  }

  const session: YggdrasilSession = {
    accessToken: account.accessToken,
    clientToken: account.clientToken,
    profile: { id: account.uuid, name: account.username },
    apiRoot: account.yggdrasil.apiRoot,
    serverName: account.yggdrasil.serverName
  }

  if (await validate(session)) return account

  logger.info(`Обновляю сессию Yggdrasil для ${account.username}`)
  const refreshed = await refreshSession(session)

  await updateTokens(account.id, {
    accessToken: refreshed.accessToken,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000
  })

  return { ...account, accessToken: refreshed.accessToken }
}

let timer: NodeJS.Timeout | null = null

export function startTokenRefresher(intervalMs = 15 * 60 * 1000): void {
  if (timer) return

  timer = setInterval(() => {
    void refreshExpiringAccounts()
  }, intervalMs)
  timer.unref()
}

export function stopTokenRefresher(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

export async function refreshExpiringAccounts(): Promise<void> {
  for (const account of await listAccounts()) {
    if (account.kind === 'guest' || !needsRefresh(account.expiresAt)) continue

    if (account.kind === 'microsoft' && !(await getSecret(SECRET_KEYS.msRefresh(account.id)))) continue

    try {
      await ensureFreshAccount(account.id)
    } catch (error) {
      logger.warn(
        `Не удалось обновить сессию ${account.username}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
