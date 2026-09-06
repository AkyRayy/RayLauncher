import { createHash, randomUUID } from 'node:crypto'
import { LIMITS } from '@shared/constants'
import { RayError } from '@shared/errors'
import { uuidWithDashes, uuidWithoutDashes } from '@shared/util'
import type { Account } from '@shared/types'

export function offlineUuid(nickname: string): string {
  const digest = createHash('md5').update(`OfflinePlayer:${nickname}`, 'utf8').digest()

  digest.writeUInt8((digest.readUInt8(6) & 0x0f) | 0x30, 6)
  digest.writeUInt8((digest.readUInt8(8) & 0x3f) | 0x80, 8)

  return uuidWithDashes(digest.toString('hex'))
}

export function isValidNickname(nickname: string): boolean {
  return LIMITS.nicknamePattern.test(nickname)
}

export function assertNickname(nickname: string): void {
  if (!isValidNickname(nickname)) {
    throw new RayError('INVALID_INPUT', 'Ник: от 3 до 16 символов, латиница, цифры и подчёркивание', {
      nickname
    })
  }
}

export function createGuestAccount(nickname: string, now = Date.now()): Account {
  assertNickname(nickname)

  const uuid = uuidWithoutDashes(offlineUuid(nickname))

  return {
    id: `guest-${uuid.slice(0, 12)}`,
    kind: 'guest',
    username: nickname,
    uuid,
    accessToken: uuid,
    clientToken: randomUUID().replaceAll('-', ''),
    createdAt: now,
    lastUsedAt: now
  }
}
