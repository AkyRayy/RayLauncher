import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyMatch, highlightParts } from '@shared/fuzzy'

describe('fuzzyMatch', () => {
  it('находит буквы по порядку, не подряд', () => {
    expect(fuzzyMatch('нст', 'Настройки')).not.toBeNull()
  })

  it('порядок букв важен', () => {
    expect(fuzzyMatch('ткн', 'Настройки')).toBeNull()
  })

  it('регистр не имеет значения', () => {
    expect(fuzzyMatch('ЛОГ', 'Логи')).not.toBeNull()
  })

  it('пустой запрос подходит всему', () => {
    expect(fuzzyMatch('', 'Что угодно')).toEqual({ score: 0, indices: [] })
  })

  it('возвращает позиции совпавших букв', () => {
    expect(fuzzyMatch('лг', 'Логи')?.indices).toEqual([0, 2])
  })

  it('совпадение с начала ценится выше, чем с середины', () => {
    const head = fuzzyMatch('про', 'Профили')?.score ?? 0
    const middle = fuzzyMatch('про', 'Быстрый прогресс')?.score ?? 0
    expect(head).toBeGreaterThan(middle)
  })

  it('подряд идущие буквы ценятся выше разбросанных', () => {
    const dense = fuzzyMatch('мод', 'Моды')?.score ?? 0
    const sparse = fuzzyMatch('мод', 'Микрофон отдельный дом')?.score ?? 0
    expect(dense).toBeGreaterThan(sparse)
  })
})

describe('fuzzyFilter', () => {
  const commands = [
    { id: 'profiles', title: 'Профили' },
    { id: 'mods', title: 'Каталог модов' },
    { id: 'installed', title: 'Установленные моды' },
    { id: 'logs', title: 'Логи' }
  ]

  it('оставляет только подходящее', () => {
    const found = fuzzyFilter('мод', commands, (item) => item.title)
    expect(found.map((entry) => entry.item.id).sort()).toEqual(['installed', 'mods'])
  })

  it('точное начало слова идёт первым', () => {
    const found = fuzzyFilter('лог', commands, (item) => item.title)
    expect(found[0]?.item.id).toBe('logs')
  })

  it('на пустой запрос возвращает всё', () => {
    expect(fuzzyFilter('', commands, (item) => item.title)).toHaveLength(commands.length)
  })

  it('ничего не находит по чужим буквам', () => {
    expect(fuzzyFilter('zzz', commands, (item) => item.title)).toEqual([])
  })
})

describe('highlightParts', () => {
  it('разбивает строку на совпавшие и обычные куски', () => {
    expect(highlightParts('Логи', [0, 2])).toEqual([
      { text: 'Л', hit: true },
      { text: 'о', hit: false },
      { text: 'г', hit: true },
      { text: 'и', hit: false }
    ])
  })

  it('склеивает соседние совпадения', () => {
    expect(highlightParts('Моды', [0, 1])).toEqual([
      { text: 'Мо', hit: true },
      { text: 'ды', hit: false }
    ])
  })

  it('без совпадений возвращает строку целиком', () => {
    expect(highlightParts('Профили', [])).toEqual([{ text: 'Профили', hit: false }])
  })
})
