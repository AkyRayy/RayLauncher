import { z } from 'zod'
import { RayError } from '@shared/errors'
import { request } from '../core/http'

export interface YggdrasilProfile {
  id: string
  name: string
}

export interface YggdrasilSession {
  accessToken: string
  clientToken: string
  profile: YggdrasilProfile
  prefetched?: string
  apiRoot: string
  serverName: string
}

const profileSchema = z.object({ id: z.string(), name: z.string() })

const authenticateSchema = z.object({
  accessToken: z.string(),
  clientToken: z.string(),
  availableProfiles: z.array(profileSchema).default([]),
  selectedProfile: profileSchema.optional()
})

const refreshSchema = z.object({
  accessToken: z.string(),
  clientToken: z.string(),
  selectedProfile: profileSchema.optional()
})

const errorSchema = z.object({
  error: z.string().optional(),
  errorMessage: z.string().optional()
})

export function normalizeApiRoot(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new RayError('INVALID_INPUT', 'Адрес сервера должен начинаться с http:// или https://')
  }
  return trimmed
}

export interface AuthenticateResult {
  session: YggdrasilSession | null
  profiles: YggdrasilProfile[]
  clientToken: string
  accessToken: string
}

export async function authenticate(params: {
  apiRoot: string
  username: string
  password: string
  clientToken: string
  serverName?: string
}): Promise<AuthenticateResult> {
  const apiRoot = normalizeApiRoot(params.apiRoot)

  const raw = await post(`${apiRoot}/authserver/authenticate`, {
    agent: { name: 'Minecraft', version: 1 },
    username: params.username,
    password: params.password,
    clientToken: params.clientToken,
    requestUser: false
  })

  const parsed = authenticateSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ Yggdrasil-сервера')

  const serverName = params.serverName ?? new URL(apiRoot).host
  const selected = parsed.data.selectedProfile

  return {
    profiles: parsed.data.availableProfiles,
    clientToken: parsed.data.clientToken,
    accessToken: parsed.data.accessToken,
    session: selected
      ? {
          accessToken: parsed.data.accessToken,
          clientToken: parsed.data.clientToken,
          profile: selected,
          apiRoot,
          serverName
        }
      : null
  }
}

export async function selectProfile(params: {
  apiRoot: string
  accessToken: string
  clientToken: string
  profile: YggdrasilProfile
  serverName?: string
}): Promise<YggdrasilSession> {
  const apiRoot = normalizeApiRoot(params.apiRoot)

  const raw = await post(`${apiRoot}/authserver/refresh`, {
    accessToken: params.accessToken,
    clientToken: params.clientToken,
    selectedProfile: params.profile
  })

  const parsed = refreshSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ Yggdrasil-сервера')

  return {
    accessToken: parsed.data.accessToken,
    clientToken: parsed.data.clientToken,
    profile: parsed.data.selectedProfile ?? params.profile,
    apiRoot,
    serverName: params.serverName ?? new URL(apiRoot).host
  }
}

export async function refreshSession(session: YggdrasilSession): Promise<YggdrasilSession> {
  const raw = await post(`${session.apiRoot}/authserver/refresh`, {
    accessToken: session.accessToken,
    clientToken: session.clientToken
  })

  const parsed = refreshSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ Yggdrasil-сервера')

  return {
    ...session,
    accessToken: parsed.data.accessToken,
    clientToken: parsed.data.clientToken,
    profile: parsed.data.selectedProfile ?? session.profile
  }
}

export async function validate(session: YggdrasilSession): Promise<boolean> {
  const response = await request(`${session.apiRoot}/authserver/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: session.accessToken, clientToken: session.clientToken }),
    noRetry: true
  })
  return response.status === 204
}

export async function invalidate(session: YggdrasilSession): Promise<void> {
  await request(`${session.apiRoot}/authserver/invalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessToken: session.accessToken, clientToken: session.clientToken }),
    noRetry: true
  }).catch(() => undefined)
}

export async function fetchPrefetched(apiRoot: string): Promise<string | undefined> {
  const response = await request(normalizeApiRoot(apiRoot), { noRetry: true }).catch(() => null)
  if (!response || !response.ok) return undefined

  const text = await response.text()
  try {
    JSON.parse(text)
  } catch {
    return undefined
  }
  return Buffer.from(text, 'utf8').toString('base64')
}

async function post(url: string, payload: unknown): Promise<unknown> {
  const response = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    noRetry: true
  })

  if (response.status === 204) return {}

  const raw: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const parsed = errorSchema.safeParse(raw)
    const message = parsed.success ? (parsed.data.errorMessage ?? parsed.data.error) : undefined
    throw new RayError(
      response.status === 403 ? 'ACCOUNT_NOT_FOUND' : 'HTTP_ERROR',
      message ?? `Сервер авторизации ответил ${response.status}`,
      { status: response.status }
    )
  }

  return raw
}
