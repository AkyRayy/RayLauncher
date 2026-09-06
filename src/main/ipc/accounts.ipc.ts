import { dialog } from 'electron'
import type { PublicAccount } from '@shared/types'
import { RayError } from '@shared/errors'
import { handle } from './registry'
import { emitEvent } from '../core/events'
import { logger } from '../logger'
import { getSettings } from '../store/settings.store'
import {
  getAccount,
  listAccounts,
  activeAccountId,
  removeAccount,
  rememberGuestNickname,
  guestNicknames,
  saveAccount,
  setActiveAccount,
  updateProfileInfo
} from '../auth/accountManager'
import { createGuestAccount } from '../auth/offline'
import { cancelMicrosoftSignIn, signInWithMicrosoft } from '../auth/microsoft'
import { authenticateWithXbox, authorizeXsts, extractXuid, xboxAuthorizationHeader } from '../auth/xbox'
import { fetchProfile, hasGameLicense, loginWithXbox } from '../auth/minecraftServices'
import {
  authenticate,
  fetchPrefetched,
  selectProfile,
  normalizeApiRoot,
  type YggdrasilProfile
} from '../auth/yggdrasil'
import { cacheSkinFromUrl, defaultVariantForUuid, importSkinFile, skinDataUrl } from '../auth/skins'
import { ensureFreshAccount } from '../auth/tokenRefresher'
import { registerLocalProfile } from '../auth/localYggdrasil'
import { randomUUID } from 'node:crypto'

const pendingYggdrasil = new Map<
  string,
  { apiRoot: string; accessToken: string; clientToken: string; profiles: YggdrasilProfile[] }
>()

export function registerAccountsIpc(): void {
  handle('accounts:list', () => listAccounts())
  handle('accounts:active', () => activeAccountId())

  handle('accounts:setActive', async ({ accountId }) => {
    await setActiveAccount(accountId)
    await broadcast()
  })

  handle('accounts:remove', async ({ accountId }) => {
    await removeAccount(accountId)
    await broadcast()
  })

  handle('accounts:addGuest', async ({ nickname }) => {
    const guest = createGuestAccount(nickname)
    const account = await saveAccount({
      kind: 'guest',
      username: guest.username,
      uuid: guest.uuid,
      accessToken: guest.accessToken,
      ...(guest.clientToken ? { clientToken: guest.clientToken } : {})
    })

    await rememberGuestNickname(nickname)
    registerLocalProfile({
      uuid: guest.uuid,
      name: guest.username,
      variant: defaultVariantForUuid(guest.uuid)
    })

    await broadcast()
    return account
  })

  handle('accounts:guestNicknames', () => guestNicknames())

  handle('accounts:signInMicrosoft', async (): Promise<PublicAccount> => {
    const clientId = getSettings().msClientId
    logger.info('Начинаю вход через Microsoft')

    const microsoft = await signInWithMicrosoft(clientId)
    const xbl = await authenticateWithXbox(microsoft.accessToken)

    const xstsRaw = await authorizeXsts(xbl.token)
    const minecraft = await loginWithXbox(xboxAuthorizationHeader(xstsRaw))

    if (!(await hasGameLicense(minecraft.accessToken))) {
      throw new RayError('MS_NO_LICENSE', 'На учётной записи нет лицензии Minecraft Java Edition')
    }

    const profile = await fetchProfile(minecraft.accessToken)
    const skin = profile.skin ? await cacheSkin(profile.skin.url, profile.skin.variant) : undefined

    const account = await saveAccount({
      kind: 'microsoft',
      username: profile.name,
      uuid: profile.id,
      accessToken: minecraft.accessToken,
      refreshToken: microsoft.refreshToken,
      expiresAt: minecraft.expiresAt,
      ...(extractXuid(xstsRaw) ? { xuid: extractXuid(xstsRaw) as string } : {}),
      ...(profile.skin ? { skin: { ...profile.skin, ...(skin ? { hash: skin } : {}) } } : {}),
      ...(profile.capeUrl ? { capeUrl: profile.capeUrl } : {})
    })

    await broadcast()
    return account
  })

  handle('accounts:cancelSignIn', () => {
    cancelMicrosoftSignIn()
  })

  handle('accounts:signInYggdrasil', async ({ apiRoot, username, password, serverName }) => {
    const clientToken = randomUUID().replaceAll('-', '')
    const result = await authenticate({ apiRoot, username, password, clientToken, ...(serverName ? { serverName } : {}) })

    if (!result.session) {
      if (result.profiles.length === 0) {
        throw new RayError('ACCOUNT_NOT_FOUND', 'На этом сервере нет ни одного профиля')
      }
      const pendingId = randomUUID()
      pendingYggdrasil.set(pendingId, {
        apiRoot: normalizeApiRoot(apiRoot),
        accessToken: result.accessToken,
        clientToken: result.clientToken,
        profiles: result.profiles
      })
      return { pendingId, profiles: result.profiles, account: null }
    }

    const account = await storeYggdrasil(result.session.apiRoot, result.session.serverName, {
      accessToken: result.session.accessToken,
      clientToken: result.session.clientToken,
      profile: result.session.profile
    })
    return { pendingId: null, profiles: [], account }
  })

  handle('accounts:chooseYggdrasilProfile', async ({ pendingId, profileId }) => {
    const pending = pendingYggdrasil.get(pendingId)
    if (!pending) throw new RayError('ACCOUNT_NOT_FOUND', 'Сессия выбора профиля истекла')

    const profile = pending.profiles.find((item) => item.id === profileId)
    if (!profile) throw new RayError('ACCOUNT_NOT_FOUND', 'Профиль не найден')

    const session = await selectProfile({
      apiRoot: pending.apiRoot,
      accessToken: pending.accessToken,
      clientToken: pending.clientToken,
      profile
    })
    pendingYggdrasil.delete(pendingId)

    return storeYggdrasil(session.apiRoot, session.serverName, {
      accessToken: session.accessToken,
      clientToken: session.clientToken,
      profile: session.profile
    })
  })

  handle('accounts:refresh', async ({ accountId }) => {
    const account = await ensureFreshAccount(accountId)
    await broadcast()

    const list = await listAccounts()
    const updated = list.find((item) => item.id === account.id)
    if (!updated) throw new RayError('ACCOUNT_NOT_FOUND', 'Аккаунт исчез во время обновления')
    return updated
  })

  handle('accounts:skin', async ({ accountId }) => {
    const account = await getAccount(accountId)
    if (!account) throw new RayError('ACCOUNT_NOT_FOUND', 'Аккаунт не найден')

    const variant = account.skin?.variant ?? defaultVariantForUuid(account.uuid)
    const hash = account.skin?.hash

    if (hash) {
      const cached = await skinDataUrl(hash)
      if (cached) return { dataUrl: cached, variant }
    }
    if (account.skin?.url) {
      const stored = await cacheSkinFromUrl(account.skin.url, variant).catch(() => null)
      if (stored) {
        await updateProfileInfo(accountId, { skin: { ...account.skin, hash: stored.hash } })
        return { dataUrl: await skinDataUrl(stored.hash), variant }
      }
    }

    return { dataUrl: null, variant }
  })

  handle('accounts:importSkin', async ({ accountId, variant }) => {
    const account = await getAccount(accountId)
    if (!account) throw new RayError('ACCOUNT_NOT_FOUND', 'Аккаунт не найден')

    const picked = await dialog.showOpenDialog({
      title: 'Выберите скин',
      filters: [{ name: 'PNG 64×64', extensions: ['png'] }],
      properties: ['openFile']
    })
    const file = picked.filePaths[0]
    if (picked.canceled || !file) return { dataUrl: null, variant }

    const image = await importSkinFile(file, variant)
    await updateProfileInfo(accountId, {
      skin: { url: `file:///${image.file.replaceAll('\\\\', '/')}`, variant, hash: image.hash }
    })

    registerLocalProfile({ uuid: account.uuid, name: account.username, skinHash: image.hash, variant })

    await broadcast()
    return { dataUrl: await skinDataUrl(image.hash), variant }
  })
}

async function storeYggdrasil(
  apiRoot: string,
  serverName: string,
  session: { accessToken: string; clientToken: string; profile: YggdrasilProfile }
): Promise<PublicAccount> {
  const prefetched = await fetchPrefetched(apiRoot)

  const account = await saveAccount({
    kind: 'yggdrasil',
    username: session.profile.name,
    uuid: session.profile.id,
    accessToken: session.accessToken,
    clientToken: session.clientToken,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    yggdrasil: { apiRoot, serverName }
  })

  if (prefetched) logger.debug(`Метаданные ${serverName} получены (${prefetched.length} символов base64)`)

  await broadcast()
  return account
}

async function cacheSkin(url: string, variant: 'classic' | 'slim'): Promise<string | null> {
  const image = await cacheSkinFromUrl(url, variant).catch(() => null)
  return image?.hash ?? null
}

async function broadcast(): Promise<void> {
  emitEvent('accounts:changed', await listAccounts())
}
