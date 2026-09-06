import { describe, expect, it } from 'vitest'
import {
  buildLiveAuthorizeUrl,
  isDefaultClientId,
  isLiveCallback,
  parseLiveRedirect
} from '@main/auth/microsoft'
import { AUTH, DEFAULT_MS_CLIENT_ID } from '@shared/constants'

describe('isDefaultClientId', () => {
  it('узнаёт официальный идентификатор лаунчера Minecraft', () => {
    expect(isDefaultClientId(DEFAULT_MS_CLIENT_ID)).toBe(true)
    expect(isDefaultClientId(`  ${DEFAULT_MS_CLIENT_ID} `)).toBe(true)
  })

  it('свой Azure Client ID идёт по другому пути входа', () => {
    expect(isDefaultClientId('11111111-2222-3333-4444-555555555555')).toBe(false)
    expect(isDefaultClientId('')).toBe(false)
  })
})

describe('buildLiveAuthorizeUrl', () => {
  const url = new URL(buildLiveAuthorizeUrl({ state: 'state-1' }))

  it('ведёт на login.live.com, а не на v2.0-эндпоинт', () => {
    expect(url.origin + url.pathname).toBe('https://login.live.com/oauth20_authorize.srf')
  })

  it('использует desktop-редирект и Xbox-скоп официального лаунчера', () => {
    expect(url.searchParams.get('client_id')).toBe(DEFAULT_MS_CLIENT_ID)
    expect(url.searchParams.get('redirect_uri')).toBe(AUTH.liveRedirect)
    expect(url.searchParams.get('redirect_uri')).toBe('https://login.live.com/oauth20_desktop.srf')
    expect(url.searchParams.get('scope')).toBe('service::user.auth.xboxlive.com::MBI_SSL')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('state-1')
  })

  it('не передаёт секрет приложения и PKCE: их нет в desktop-потоке', () => {
    expect(url.searchParams.get('client_secret')).toBeNull()
    expect(url.searchParams.get('code_challenge')).toBeNull()
  })
})

describe('isLiveCallback', () => {
  it('ловит только desktop-редирект', () => {
    expect(isLiveCallback('https://login.live.com/oauth20_desktop.srf?code=abc&state=s')).toBe(true)
    expect(isLiveCallback('https://login.live.com/oauth20_authorize.srf?client_id=x')).toBe(false)
    expect(isLiveCallback('https://example.com/oauth20_desktop.srf?code=abc')).toBe(false)
  })
})

describe('parseLiveRedirect', () => {
  const callback = (tail: string): string => `https://login.live.com/oauth20_desktop.srf${tail}`

  it('достаёт код из query при совпадении state', () => {
    expect(parseLiveRedirect(callback('?code=M.C123&state=ok'), 'ok')).toEqual({ code: 'M.C123' })
  })

  it('достаёт код из fragment, если query пустой', () => {
    expect(parseLiveRedirect(callback('#code=M.C123&state=ok'), 'ok')).toEqual({ code: 'M.C123' })
  })

  it('отвергает ответ с чужим state', () => {
    const result = parseLiveRedirect(callback('?code=M.C123&state=attacker'), 'ok')
    expect('error' in result && result.error.code).toBe('INVALID_INPUT')
  })

  it('отказ пользователя отличается от сетевой ошибки', () => {
    const denied = parseLiveRedirect(callback('?error=access_denied&state=ok'), 'ok')
    expect('error' in denied && denied.error.code).toBe('MS_CANCELLED')
  })

  it('ответ без кода — это ошибка, а не пустая строка', () => {
    const result = parseLiveRedirect(callback('?state=ok'), 'ok')
    expect('error' in result && result.error.code).toBe('HTTP_ERROR')
  })
})
