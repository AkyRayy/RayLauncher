import { describe, expect, it } from 'vitest'
import { absoluteImage, normalizeDate, toMinecraftItem } from '@main/news/news'

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

describe('toMinecraftItem', () => {
  it('принимает запись с tag: null — реальный формат Mojang', () => {
    const item = toMinecraftItem(
      {
        id: 'abc123',
        title: 'New on Java Realms',
        tag: null,
        category: null,
        date: '2026-08-28',
        text: '9 new maps!',
        newsPageImage: { url: '/v2/images/cover.png' },
        readMoreLink: 'https://www.minecraft.net/article/x',
        newsType: ['Java', 'News page']
      },
      0
    )

    expect(item).not.toBeNull()
    expect(item?.category).toBe('Minecraft')
    expect(item?.summary).toBe('9 new maps!')
    expect(item?.imageUrl).toBe('https://launchercontent.mojang.com/v2/images/cover.png')
  })

  it('принимает text: null и newsType: null вместо падения всей ленты', () => {
    const item = toMinecraftItem(
      { title: 'Bedrock news', date: '2026-08-27', text: null, newsType: null },
      3
    )

    expect(item).not.toBeNull()
    expect(item?.summary).toBe('')
    expect(item?.id).toBe('mc-2026-08-27-3')
  })

  it('отбрасывает запись без Java в newsType', () => {
    expect(
      toMinecraftItem({ title: 'Bedrock only', date: '2026-08-27', newsType: ['Bedrock'] }, 0)
    ).toBeNull()
  })

  it('отбрасывает запись без заголовка, а не роняет ленту', () => {
    expect(toMinecraftItem({ title: '  ', date: '2026-08-27' }, 0)).toBeNull()
    expect(toMinecraftItem({ date: '2026-08-27' }, 0)).toBeNull()
  })
})
