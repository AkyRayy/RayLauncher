import { describe, expect, it } from 'vitest'
import {
  motdToPlain,
  parseStatusResponse,
  readVarInt,
  stripMotd,
  writeVarInt
} from '../src/main/servers/ping'

describe('varint', () => {
  it('кодирует и читает значения туда-обратно', () => {
    for (const value of [0, 1, 127, 128, 255, 25565, 2_147_483_647]) {
      const encoded = writeVarInt(value)
      expect(readVarInt(encoded)).toEqual({ value, bytes: encoded.length })
    }
  })
})

describe('motd', () => {
  it('срезает секционные коды и схлопывает пробелы', () => {
    expect(stripMotd('§aПривет, §lмир!')).toBe('Привет, мир!')
    expect(stripMotd('&cСтарый  формат   с   пробелами')).toBe('Старый формат с пробелами')
  })

  it('собирает MOTD из строк, объектов и extra', () => {
    expect(motdToPlain('§bПросто строка')).toBe('Просто строка')
    expect(motdToPlain({ text: 'A', extra: [{ text: 'B' }, { text: 'C' }] })).toBe('ABC')
    expect(motdToPlain([{ text: 'X' }, 'Y'])).toBe('XY')
    expect(motdToPlain(42)).toBe('')
  })
})

describe('parseStatusResponse', () => {
  it('парсит классический ответ статуса', () => {
    const status = parseStatusResponse(
      JSON.stringify({
        version: { name: '1.21.4', protocol: 769 },
        players: { max: 100, online: 5 },
        description: { text: '§aДобро пожаловать' }
      }),
      42
    )
    expect(status.online).toBe(true)
    expect(status.version).toBe('1.21.4')
    expect(status.playersOnline).toBe(5)
    expect(status.playersMax).toBe(100)
    expect(status.motd).toBe('Добро пожаловать')
    expect(status.latencyMs).toBe(42)
  })

  it('не падает на мусоре', () => {
    expect(parseStatusResponse('не json', 10).online).toBe(false)
    expect(parseStatusResponse('{"hello":"world"}', 10).online).toBe(false)
  })
})
