import { describe, expect, it } from 'vitest'
import { themePackFileSchema } from '../src/main/themes/themes'

describe('themePackFileSchema', () => {
  it('принимает корректный файл темы', () => {
    const parsed = themePackFileSchema.parse({
      name: 'Моя тема',
      author: 'Ray',
      theme: 'dark',
      accent: 'amber',
      density: 'comfortable',
      cssVars: { '--accent': '#ffb000' }
    })
    expect(parsed.name).toBe('Моя тема')
    expect(parsed.cssVars['--accent']).toBe('#ffb000')
  })

  it('отвергает мусор в акцентах и CSS', () => {
    expect(() =>
      themePackFileSchema.parse({
        name: 'X',
        theme: 'dark',
        accent: 'nope',
        density: 'comfortable'
      })
    ).toThrow()
    expect(() =>
      themePackFileSchema.parse({
        name: 'X',
        theme: 'dark',
        accent: 'amber',
        density: 'comfortable',
        cssVars: { color: 'red' }
      })
    ).toThrow()
    expect(() =>
      themePackFileSchema.parse({
        name: 'X',
        theme: 'dark',
        accent: 'amber',
        density: 'comfortable',
        cssVars: { '--x': 'a; b' }
      })
    ).toThrow()
  })
})
