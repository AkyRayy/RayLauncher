import { describe, expect, it } from 'vitest'
import { createGuestAccount, isValidNickname, offlineUuid } from '../src/main/auth/offline'
import { RayError } from '../src/shared/errors'

describe('offlineUuid', () => {
  it('совпадает с UUID v3 от "OfflinePlayer:{ник}"', () => {
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f')
    expect(offlineUuid('Player')).toBe('a01e3843-e521-3998-958a-f459800e4d11')
    expect(offlineUuid('Steve')).toBe('5627dd98-e6be-3c21-b8a8-e92344183641')
  })

  it('версия 3 и вариант RFC 4122 стоят в нужных разрядах', () => {
    const uuid = offlineUuid('SomePlayer_1')
    expect(uuid[14]).toBe('3')
    expect(['8', '9', 'a', 'b']).toContain(uuid[19])
  })

  it('регистр ника меняет UUID: это разные игроки для сервера', () => {
    expect(offlineUuid('Notch')).not.toBe(offlineUuid('notch'))
  })

  it('результат стабилен между вызовами', () => {
    expect(offlineUuid('Player')).toBe(offlineUuid('Player'))
  })
})

describe('isValidNickname', () => {
  it('принимает допустимые ники', () => {
    expect(isValidNickname('Player')).toBe(true)
    expect(isValidNickname('a_1')).toBe(true)
    expect(isValidNickname('ABCDEFGHIJKLMNOP')).toBe(true)
  })

  it('отклоняет короткие, длинные и с недопустимыми символами', () => {
    expect(isValidNickname('ab')).toBe(false)
    expect(isValidNickname('ABCDEFGHIJKLMNOPQ')).toBe(false)
    expect(isValidNickname('Игрок')).toBe(false)
    expect(isValidNickname('Player 1')).toBe(false)
    expect(isValidNickname('Player-1')).toBe(false)
  })
})

describe('createGuestAccount', () => {
  it('собирает аккаунт с UUID без дефисов', () => {
    const account = createGuestAccount('Player', 1_700_000_000_000)

    expect(account.kind).toBe('guest')
    expect(account.username).toBe('Player')
    expect(account.uuid).toBe('a01e3843e5213998958af459800e4d11')
    expect(account.uuid).not.toContain('-')
    expect(account.accessToken.length).toBeGreaterThan(0)
    expect(account.createdAt).toBe(1_700_000_000_000)
  })

  it('падает с понятным кодом на плохом нике', () => {
    expect(() => createGuestAccount('ник')).toThrowError(RayError)
    try {
      createGuestAccount('ник')
    } catch (error) {
      expect((error as RayError).code).toBe('INVALID_INPUT')
    }
  })
})
