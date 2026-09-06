import { z } from 'zod'
import { AUTH } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { AccountSkin } from '@shared/types'
import { request } from '../core/http'
import { logger } from '../logger'

export interface MinecraftToken {
  accessToken: string
  expiresAt: number
}

export interface MinecraftProfile {
  id: string
  name: string
  skin?: AccountSkin
  capeUrl?: string
}

const loginSchema = z.object({
  username: z.string().optional(),
  access_token: z.string(),
  expires_in: z.number()
})

const entitlementsSchema = z.object({
  items: z.array(z.object({ name: z.string(), signature: z.string().optional() })).default([])
})

const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  skins: z
    .array(
      z.object({
        id: z.string(),
        state: z.string(),
        url: z.string(),
        variant: z.string().optional(),
        textureKey: z.string().optional()
      })
    )
    .default([]),
  capes: z
    .array(z.object({ id: z.string(), state: z.string(), url: z.string(), alias: z.string().optional() }))
    .default([])
})

export async function loginWithXbox(authorizationHeader: string): Promise<MinecraftToken> {
  const response = await request(AUTH.loginWithXbox, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken: authorizationHeader }),
    noRetry: true
  })

  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `Minecraft Services ответил ${response.status}`, {
      status: response.status
    })
  }

  const parsed = loginSchema.safeParse(await response.json())
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ login_with_xbox')

  return {
    accessToken: parsed.data.access_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000
  }
}

export async function hasGameLicense(accessToken: string): Promise<boolean> {
  const response = await request(AUTH.entitlements, {
    headers: { Authorization: `Bearer ${accessToken}` },
    noRetry: true
  })

  if (!response.ok) {
    logger.warn(`Проверка лицензии вернула ${response.status}, полагаемся на профиль`)
    return true
  }

  const parsed = entitlementsSchema.safeParse(await response.json())
  if (!parsed.success) return true

  const names = new Set(parsed.data.items.map((item) => item.name))
  return names.has('product_minecraft') || names.has('game_minecraft') || names.size > 0
}

export async function fetchProfile(accessToken: string): Promise<MinecraftProfile> {
  const response = await request(AUTH.profile, {
    headers: { Authorization: `Bearer ${accessToken}` },
    noRetry: true
  })

  if (response.status === 404) {
    throw new RayError(
      'MS_NO_PROFILE',
      'Профиль Minecraft не создан: зайдите на minecraft.net и выберите ник'
    )
  }
  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `Профиль недоступен: ответ ${response.status}`, {
      status: response.status
    })
  }

  const parsed = profileSchema.safeParse(await response.json())
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ профиля Minecraft')

  const activeSkin = parsed.data.skins.find((skin) => skin.state === 'ACTIVE')
  const activeCape = parsed.data.capes.find((cape) => cape.state === 'ACTIVE')

  return {
    id: parsed.data.id,
    name: parsed.data.name,
    ...(activeSkin
      ? {
          skin: {
            url: activeSkin.url,
            variant: activeSkin.variant?.toUpperCase() === 'SLIM' ? 'slim' : 'classic',
            hash: activeSkin.id
          } satisfies AccountSkin
        }
      : {}),
    ...(activeCape ? { capeUrl: activeCape.url } : {})
  }
}
