import { describe, expect, it } from 'vitest'
import { ZipBuilder, crc32 } from '../src/main/core/zipx'

describe('crc32', () => {
  it('совпадает с эталонным вектором', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf4_3926)
  })
})

describe('ZipBuilder', () => {
  it('строит читаемый stored-архив с двумя файлами', () => {
    const zip = new ZipBuilder()
      .addFile('modrinth.index.json', '{"a":1}')
      .addFile('overrides/config/x.cfg', 'v=1')
      .build()

    // Локальный заголовок первого файла: сигнатура PK\x03\x04, метод store (0).
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    expect(zip.readUInt16LE(8)).toBe(0)

    // Конец централа: сигнатура EOCD и счётчик файлов.
    const eocd = zip.length - 22
    expect(zip.readUInt32LE(eocd)).toBe(0x0605_4b50)
    expect(zip.readUInt16LE(eocd + 8)).toBe(2)
    expect(zip.readUInt16LE(eocd + 10)).toBe(2)

    // Содержимое лежит как есть, без сжатия.
    expect(zip.includes('{"a":1}')).toBe(true)
    expect(zip.includes('v=1')).toBe(true)
  })

  it('нормализует пути и отвергает пустые имена', () => {
    const zip = new ZipBuilder().addFile('a\\b.txt', 'x').build()
    expect(zip.includes('a/b.txt')).toBe(true)
    expect(() => new ZipBuilder().addFile('', 'x')).toThrow()
  })
})
