import { describe, expect, it } from 'vitest'
import { absoluteImage, normalizeDate } from '@main/news/news'

describe('normalizeDate', () => {
  it('дата без времени превращается в ISO', () => {
    expect(normalizeDate('2026-09-05')).toBe('2026-09-05T00:00:00.000Z')
  })

  it('полный ISO остаётся сопоставимым', () => {
    expect(normalizeDate('2026-09-05T12:30:00Z')).toBe('2026-09-05T12:30:00.000Z')
  })

  it('мусор не ломает сортировку, а уходит в конец ленты', () => {
    expect(normalizeDate('позавчера')).toBe('1970-01-01T00:00:00.000Z')
  })

  it('пустая строка тоже даёт валидную дату', () => {
    expect(() => new Date(normalizeDate('')).toISOString()).not.toThrow()
  })

  it('после нормализации записи сортируются по убыванию', () => {
    const dates = ['2026-08-01', '2026-09-05T12:00:00Z', '2026-07-15']
      .map(normalizeDate)
      .sort((left, right) => Date.parse(right) - Date.parse(left))

    expect(dates[0]).toBe('2026-09-05T12:00:00.000Z')
    expect(dates[2]).toBe('2026-07-15T00:00:00.000Z')
  })
})

describe('absoluteImage', () => {
  it('дополняет относительный путь доменом Mojang', () => {
    expect(absoluteImage('/v2/images/cover.png')).toBe(
      'https://launchercontent.mojang.com/v2/images/cover.png'
    )
  })

  it('добавляет слэш, если его нет', () => {
    expect(absoluteImage('v2/images/cover.png')).toBe(
      'https://launchercontent.mojang.com/v2/images/cover.png'
    )
  })

  it('абсолютную ссылку оставляет как есть', () => {
    expect(absoluteImage('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png')
  })
})
