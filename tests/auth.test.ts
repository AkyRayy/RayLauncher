import { describe, expect, it } from 'vitest'
import { mapXstsError } from '@main/auth/xbox'
import { defaultVariantForUuid, isValidSkinSize, readPngSize } from '@main/auth/skins'
import { injectorJvmArgs } from '@main/auth/authlibInjector'
import { needsRefresh, REFRESH_MARGIN_MS } from '@main/auth/tokenRefresher'
import { normalizeApiRoot } from '@main/auth/yggdrasil'
import { deflateSync } from 'node:zlib'
import { crc32 } from 'node:zlib'

describe('mapXstsError', () => {
  it('различает отсутствие профиля Xbox и детскую учётную запись', () => {
    expect(mapXstsError(2148916233).code).toBe('MS_NO_XBOX')
    expect(mapXstsError(2148916238).code).toBe('MS_MINOR')
  })

  it('регион выделен в отдельный код: советы пользователю разные', () => {
    const region = mapXstsError(2148916235)
    expect(region.code).toBe('MS_REGION')
    expect(region.message).toMatch(/стран/i)
  })

  it('проверка возраста трактуется как проблема профиля Xbox', () => {
    expect(mapXstsError(2148916236).code).toBe('MS_NO_XBOX')
    expect(mapXstsError(2148916237).message).toMatch(/возраст/i)
  })

  it('неизвестный и отсутствующий код дают общий отказ, а не падение', () => {
    expect(mapXstsError(1234).code).toBe('MS_NO_XBOX')
    expect(mapXstsError(undefined).code).toBe('MS_NO_XBOX')
  })

  it('сообщения всегда на русском и без числа XErr внутри текста', () => {
    for (const xerr of [2148916233, 2148916235, 2148916238, undefined]) {
      const { message } = mapXstsError(xerr)
      expect(message).not.toMatch(/\d{10}/)
      expect(message.length).toBeGreaterThan(10)
    }
  })
})

describe('readPngSize', () => {
  it('читает размеры из IHDR', () => {
    expect(readPngSize(png(64, 64))).toEqual({ width: 64, height: 64 })
    expect(readPngSize(png(64, 32))).toEqual({ width: 64, height: 32 })
  })

  it('возвращает null для не-PNG и обрезанных данных', () => {
    expect(readPngSize(Buffer.from('GIF89a'))).toBeNull()
    expect(readPngSize(png(64, 64).subarray(0, 20))).toBeNull()
  })

  it('не принимает JPEG, переименованный в .png', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)])
    expect(readPngSize(jpeg)).toBeNull()
  })
})

describe('isValidSkinSize', () => {
  it('пропускает только 64×64 и старый 64×32', () => {
    expect(isValidSkinSize(64, 64)).toBe(true)
    expect(isValidSkinSize(64, 32)).toBe(true)
  })

  it('отклоняет HD-скины и произвольные картинки', () => {
    expect(isValidSkinSize(128, 128)).toBe(false)
    expect(isValidSkinSize(64, 128)).toBe(false)
    expect(isValidSkinSize(32, 32)).toBe(false)
    expect(isValidSkinSize(1920, 1080)).toBe(false)
  })
})

describe('defaultVariantForUuid', () => {
  it('чётный xor блоков даёт Стива, нечётный — Алекс', () => {
    expect(defaultVariantForUuid('00000000000000000000000000000000')).toBe('classic')
    expect(defaultVariantForUuid('00000000000000000000000000000001')).toBe('slim')
  })

  it('форма записи UUID не влияет на результат', () => {
    const dashed = 'b50ad385-829d-3141-a216-7e7d7539ba7f'
    expect(defaultVariantForUuid(dashed)).toBe(defaultVariantForUuid(dashed.replaceAll('-', '')))
  })

  it('короткая строка не роняет расчёт', () => {
    expect(defaultVariantForUuid('abc')).toBe('classic')
  })
})

describe('injectorJvmArgs', () => {
  const jarPath = 'C:\\Users\\Player\\AppData\\Roaming\\RayLauncher\\cache\\authlib-injector-1.2.8.jar'

  it('собирает -javaagent с адресом сервера через знак равенства', () => {
    const args = injectorJvmArgs({ jarPath, apiRoot: 'https://authserver.ely.by' })
    expect(args[0]).toBe(`-javaagent:${jarPath}=https://authserver.ely.by`)
  })

  it('всегда помечает сторону как клиентскую', () => {
    expect(injectorJvmArgs({ jarPath, apiRoot: 'http://127.0.0.1:5000' })).toContain(
      '-Dauthlibinjector.side=client'
    )
  })

  it('добавляет prefetched только когда метаданные получены', () => {
    const without = injectorJvmArgs({ jarPath, apiRoot: 'http://127.0.0.1:5000' })
    expect(without).toHaveLength(2)

    const with64 = injectorJvmArgs({ jarPath, apiRoot: 'http://127.0.0.1:5000', prefetched: 'eyJhIjoxfQ==' })
    expect(with64).toContain('-Dauthlibinjector.yggdrasil.prefetched=eyJhIjoxfQ==')
  })

  it('путь с пробелами остаётся одним аргументом без кавычек', () => {
    const spaced = 'C:\\Program Files\\RayLauncher\\authlib-injector-1.2.8.jar'
    const args = injectorJvmArgs({ jarPath: spaced, apiRoot: 'https://example.com' })
    expect(args[0]).toBe(`-javaagent:${spaced}=https://example.com`)
    expect(args[0]).not.toContain('"')
  })
})

describe('needsRefresh', () => {
  const now = 1_700_000_000_000

  it('гостевой аккаунт без срока не обновляется', () => {
    expect(needsRefresh(undefined, now)).toBe(false)
  })

  it('обновляем заранее, а не в момент истечения', () => {
    expect(needsRefresh(now + REFRESH_MARGIN_MS - 1, now)).toBe(true)
    expect(needsRefresh(now + REFRESH_MARGIN_MS + 1000, now)).toBe(false)
  })

  it('просроченный токен требует обновления', () => {
    expect(needsRefresh(now - 1, now)).toBe(true)
  })
})

describe('normalizeApiRoot', () => {
  it('срезает завершающие слэши и пробелы', () => {
    expect(normalizeApiRoot('  https://authserver.ely.by///  ')).toBe('https://authserver.ely.by')
  })

  it('сохраняет путь до API, если он указан', () => {
    expect(normalizeApiRoot('https://littleskin.cn/api/yggdrasil/')).toBe(
      'https://littleskin.cn/api/yggdrasil'
    )
  })

  it('требует схему http или https', () => {
    expect(() => normalizeApiRoot('authserver.ely.by')).toThrow(/http/)
    expect(() => normalizeApiRoot('ftp://example.com')).toThrow(/http/)
  })
})

function png(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData.writeUInt8(8, 8)
  ihdrData.writeUInt8(6, 9)

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdrData),
    chunk('IDAT', deflateSync(Buffer.alloc(width * height * 4 + height))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body) >>> 0)

  return Buffer.concat([length, body, checksum])
}
