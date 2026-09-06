import { describe, expect, it } from 'vitest'
import {
  buildClasspath,
  commandLineLength,
  dedupeEntries,
  CLASSPATH_SEPARATOR
} from '../src/main/minecraft/classpath'

describe('classpath', () => {
  it('соединяет пути точкой с запятой — это Windows', () => {
    expect(CLASSPATH_SEPARATOR).toBe(';')
    expect(buildClasspath(['C:\\a.jar', 'C:\\b.jar'])).toBe('C:\\a.jar;C:\\b.jar')
  })

  it('убирает дубли, сохраняя порядок первого вхождения', () => {
    expect(dedupeEntries(['C:\\a.jar', 'C:\\b.jar', 'C:\\a.jar'])).toEqual(['C:\\a.jar', 'C:\\b.jar'])
  })

  it('считает пути одинаковыми независимо от регистра и лишних сегментов', () => {
    expect(dedupeEntries(['C:\\Libs\\a.jar', 'C:\\libs\\.\\a.jar'])).toHaveLength(1)
  })

  it('пропускает пустые записи', () => {
    expect(dedupeEntries(['', 'C:\\a.jar'])).toEqual(['C:\\a.jar'])
  })

  it('не трогает пробелы и кириллицу: экранирование не нужно без shell', () => {
    expect(buildClasspath(['C:\\Мои игры\\a.jar'])).toBe('C:\\Мои игры\\a.jar')
  })

  it('измеряет длину командной строки вместе с пробелами', () => {
    expect(commandLineLength('java.exe', ['-cp', 'a.jar'])).toBe(8 + 4 + 6)
  })
})
