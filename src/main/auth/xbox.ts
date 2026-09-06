import { z } from 'zod'
import { AUTH } from '@shared/constants'
import { RayError, type ErrorCode } from '@shared/errors'
import { request } from '../core/http'

export interface XboxToken {
  token: string
  userHash: string
  expiresAt: number
}

const xboxResponseSchema = z.object({
  IssueInstant: z.string().optional(),
  NotAfter: z.string().optional(),
  Token: z.string(),
  DisplayClaims: z.object({ xui: z.array(z.object({ uhs: z.string(), xid: z.string().optional() })) })
})

export function mapXstsError(xerr: number | undefined): { code: ErrorCode; message: string } {
  switch (xerr) {
    case 2148916233:
      return {
        code: 'MS_NO_XBOX',
        message: 'К учётной записи Microsoft не привязан профиль Xbox — создайте его на xbox.com'
      }
    case 2148916235:
      return {
        code: 'MS_REGION',
        message: 'Xbox Live недоступен в стране, указанной в учётной записи'
      }
    case 2148916236:
    case 2148916237:
      return {
        code: 'MS_NO_XBOX',
        message: 'Учётной записи нужна проверка возраста на сайте Xbox'
      }
    case 2148916238:
      return {
        code: 'MS_MINOR',
        message: 'Учётная запись детская: добавьте её в семейную группу взрослого'
      }
    default:
      return { code: 'MS_NO_XBOX', message: 'Xbox Live отклонил вход' }
  }
}

export async function authenticateWithXbox(microsoftAccessToken: string): Promise<XboxToken> {
  const response = await request(AUTH.xboxLive, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${microsoftAccessToken}`
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }),
    noRetry: true
  })

  if (!response.ok) {
    throw new RayError('MS_NO_XBOX', `Xbox Live ответил ${response.status}`, {
      status: response.status
    })
  }

  return toToken(await response.json())
}

export async function authorizeXsts(xblToken: string): Promise<XboxToken> {
  const response = await request(AUTH.xsts, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      Properties: { SandboxId: 'RETAIL', UserTokens: [xblToken] },
      RelyingParty: 'rp://api.minecraftservices.com/',
      TokenType: 'JWT'
    }),
    noRetry: true
  })

  if (response.status === 401) {
    const body: unknown = await response.json().catch(() => null)
    const xerr =
      body && typeof body === 'object' && 'XErr' in body ? Number((body as { XErr: unknown }).XErr) : undefined
    const mapped = mapXstsError(xerr)
    throw new RayError(mapped.code, mapped.message, { xerr })
  }

  if (!response.ok) {
    throw new RayError('MS_NO_XBOX', `XSTS ответил ${response.status}`, { status: response.status })
  }

  return toToken(await response.json())
}

export function xboxAuthorizationHeader(token: XboxToken): string {
  return `XBL3.0 x=${token.userHash};${token.token}`
}

function toToken(raw: unknown): XboxToken {
  const parsed = xboxResponseSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ Xbox Live')

  const userHash = parsed.data.DisplayClaims.xui[0]?.uhs
  if (!userHash) throw new RayError('MS_NO_XBOX', 'Xbox Live не вернул идентификатор пользователя')

  const notAfter = parsed.data.NotAfter ? Date.parse(parsed.data.NotAfter) : Number.NaN

  return {
    token: parsed.data.Token,
    userHash,
    expiresAt: Number.isFinite(notAfter) ? notAfter : Date.now() + 24 * 60 * 60 * 1000
  }
}

export function extractXuid(raw: unknown): string | undefined {
  const parsed = xboxResponseSchema.safeParse(raw)
  return parsed.success ? parsed.data.DisplayClaims.xui[0]?.xid : undefined
}
