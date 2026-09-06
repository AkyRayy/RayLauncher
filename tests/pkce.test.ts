import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { base64Url, buildAuthorizeUrl, createPkcePair, parseRedirect } from '@main/auth/microsoft'

describe('base64Url', () => {
  it('убирает выравнивание и заменяет символы, недопустимые в URL', () => {
    const encoded = base64Url(Buffer.from([251, 255, 190, 0]))
    expect(encoded).not.toContain('=')
    expect(encoded).not.toContain('+')
    expect(encoded).not.toContain('/')
    expect(encoded).toBe('+/++AA'.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''))
  })
})

describe('createPkcePair', () => {
  it('verifier укладывается в границы RFC 7636', () => {
    const { verifier } = createPkcePair()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  it('challenge — это base64url от SHA-256 verifier', () => {
    const { verifier, challenge } = createPkcePair()
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')

    expect(challenge).toBe(expected)
  })

  it('каждый вызов даёт новую пару', () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier)
  })
})

describe('buildAuthorizeUrl', () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: '00000000-402b-0000-0000-000000000000',
      redirectUri: 'http://127.0.0.1:51742/callback',
      challenge: 'abc123',
      state: 'xyz'
    })
  )

  it('идёт на конечную точку consumers, а не common', () => {
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize'
    )
  })

  it('запрашивает код с S256 и офлайн-доступом', () => {
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBe('abc123')
    expect(url.searchParams.get('scope')).toContain('offline_access')
    expect(url.searchParams.get('scope')).toContain('XboxLive.signin')
  })

  it('не передаёт секрет приложения: у десктопного клиента его нет', () => {
    expect(url.searchParams.get('client_secret')).toBeNull()
  })
})

describe('parseRedirect', () => {
  it('возвращает код при совпадении state', () => {
    const result = parseRedirect('/callback?code=M.C123&state=expected', 'expected')
    expect(result).toEqual({ code: 'M.C123' })
  })

  it('отвергает ответ с чужим state', () => {
    const result = parseRedirect('/callback?code=M.C123&state=attacker', 'expected')
    expect('error' in result && result.error.code).toBe('INVALID_INPUT')
  })

  it('отвергает ответ без state', () => {
    const result = parseRedirect('/callback?code=M.C123', 'expected')
    expect('error' in result).toBe(true)
  })

  it('отказ пользователя отличается от сетевой ошибки', () => {
    const denied = parseRedirect('/callback?error=access_denied&state=expected', 'expected')
    expect('error' in denied && denied.error.code).toBe('MS_CANCELLED')

    const failed = parseRedirect(
      '/callback?error=server_error&error_description=Try+later&state=expected',
      'expected'
    )
    expect('error' in failed && failed.error.code).toBe('HTTP_ERROR')
    expect('error' in failed && failed.error.message).toBe('Try later')
  })

  it('ошибка проверяется раньше state: Microsoft может не вернуть его', () => {
    const result = parseRedirect('/callback?error=access_denied', 'expected')
    expect('error' in result && result.error.code).toBe('MS_CANCELLED')
  })

  it('ответ без кода — это ошибка, а не пустая строка', () => {
    const result = parseRedirect('/callback?state=expected', 'expected')
    expect('error' in result && result.error.code).toBe('HTTP_ERROR')
  })
})
