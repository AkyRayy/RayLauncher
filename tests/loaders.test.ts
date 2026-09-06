import { describe, expect, it } from 'vitest'
import { parseMavenMetadata } from '@main/loaders/mavenIndex'
import { neoforgePrefix } from '@main/loaders/neoforge'
import { forgePrefix, forgeShortVersion } from '@main/loaders/forge'

const METADATA = `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>net.neoforged</groupId>
  <artifactId>neoforge</artifactId>
  <versioning>
    <latest>21.1.209</latest>
    <release>21.1.209</release>
    <versions>
      <version>20.2.88</version>
      <version>21.0.167</version>
      <version>21.1.180-beta</version>
      <version>21.1.209</version>
    </versions>
    <lastUpdated>20250101000000</lastUpdated>
  </versioning>
</metadata>`

describe('parseMavenMetadata', () => {
  it('достаёт все версии в порядке публикации', () => {
    expect(parseMavenMetadata(METADATA)).toEqual([
      '20.2.88',
      '21.0.167',
      '21.1.180-beta',
      '21.1.209'
    ])
  })

  it('не путает <version> с <latest> и <release>', () => {
    const versions = parseMavenMetadata(METADATA)
    expect(versions).toHaveLength(4)
    expect(versions.filter((value) => value === '21.1.209')).toHaveLength(1)
  })

  it('пустые и битые метаданные дают пустой список, а не исключение', () => {
    expect(parseMavenMetadata('')).toEqual([])
    expect(parseMavenMetadata('<metadata><versioning></versioning></metadata>')).toEqual([])
    expect(parseMavenMetadata('<version></version><version>  </version>')).toEqual([])
  })

  it('переносы строк и пробелы внутри тега не мешают', () => {
    expect(parseMavenMetadata('<version> 1.20.1-47.4.6 </version>')).toEqual(['1.20.1-47.4.6'])
  })
})

describe('neoforgePrefix', () => {
  it('версия с патчем даёт мажор.минор из номера игры', () => {
    expect(neoforgePrefix('1.21.1')).toBe('21.1.')
    expect(neoforgePrefix('1.20.4')).toBe('20.4.')
  })

  it('версия без патча — это нулевая минорная ветка NeoForge', () => {
    expect(neoforgePrefix('1.21')).toBe('21.0.')
  })

  it('снапшоты и странные строки отбрасываются', () => {
    expect(neoforgePrefix('26.3-pre-2')).toBeNull()
    expect(neoforgePrefix('24w14a')).toBeNull()
    expect(neoforgePrefix('')).toBeNull()
  })
})

describe('forge', () => {
  it('префикс включает дефис, иначе 1.20.1 совпал бы с 1.20.10', () => {
    expect(forgePrefix('1.20.1')).toBe('1.20.1-')
    expect('1.20.10-47.0.0'.startsWith(forgePrefix('1.20.1'))).toBe(false)
  })

  it('короткая версия убирает версию игры из полного идентификатора', () => {
    expect(forgeShortVersion('1.20.1', '1.20.1-47.4.6')).toBe('47.4.6')
  })

  it('старые сборки с хвостом сохраняются целиком', () => {
    expect(forgeShortVersion('1.7.10', '1.7.10-10.13.4.1614-1.7.10')).toBe('10.13.4.1614-1.7.10')
  })

  it('чужая строка возвращается без изменений', () => {
    expect(forgeShortVersion('1.20.1', '47.4.6')).toBe('47.4.6')
  })
})
