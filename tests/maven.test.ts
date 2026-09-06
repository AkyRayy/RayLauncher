import { describe, expect, it } from 'vitest'
import { libraryKey, mavenPath, mavenUrl, parseMaven, repositoryCandidates, withClassifier } from '@main/minecraft/maven'
import { RayError } from '@shared/errors'

describe('parseMaven', () => {
  it('разбирает обычные координаты', () => {
    expect(parseMaven('com.mojang:logging:1.5.10')).toEqual({
      group: 'com.mojang',
      artifact: 'logging',
      version: '1.5.10',
      extension: 'jar'
    })
  })

  it('разбирает classifier и расширение', () => {
    expect(parseMaven('net.neoforged:neoforge:21.1.9:installer@jar')).toMatchObject({
      classifier: 'installer',
      extension: 'jar'
    })
    expect(parseMaven('net.minecraftforge:forge:1.20.1-47.2.0:universal@zip').extension).toBe('zip')
  })

  it('отвергает мусор', () => {
    expect(() => parseMaven('простотекст')).toThrow(RayError)
    expect(() => parseMaven('a:b')).toThrow(RayError)
    expect(() => parseMaven('a:b:c:d:e')).toThrow(RayError)
  })
})

describe('mavenPath', () => {
  it('превращает точки группы в каталоги', () => {
    expect(mavenPath('com.mojang:logging:1.5.10')).toBe('com/mojang/logging/1.5.10/logging-1.5.10.jar')
  })

  it('добавляет classifier к имени файла', () => {
    expect(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-windows')).toBe(
      'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar'
    )
  })

  it('уважает расширение после @', () => {
    expect(mavenPath('net.minecraftforge:forge:1.20.1-47.2.0:universal@zip')).toBe(
      'net/minecraftforge/forge/1.20.1-47.2.0/forge-1.20.1-47.2.0-universal.zip'
    )
  })
})

describe('withClassifier', () => {
  it('подменяет classifier, сохраняя версию', () => {
    expect(withClassifier('org.lwjgl:lwjgl:3.3.3', 'natives-windows-arm64')).toBe(
      'org.lwjgl:lwjgl:3.3.3:natives-windows-arm64'
    )
  })

  it('переносит нестандартное расширение', () => {
    expect(withClassifier('a.b:c:1.0@zip', 'natives-windows')).toBe('a.b:c:1.0:natives-windows@zip')
  })
})

describe('repositoryCandidates', () => {
  it('ставит репозиторий библиотеки первым и дописывает слеш', () => {
    const list = repositoryCandidates('https://maven.fabricmc.net')
    expect(list[0]).toBe('https://maven.fabricmc.net/')
    expect(list).toContain('https://libraries.minecraft.net/')
  })

  it('без своего репозитория первым идёт Mojang', () => {
    expect(repositoryCandidates()[0]).toBe('https://libraries.minecraft.net/')
  })

  it('не дублирует одинаковые адреса', () => {
    const list = repositoryCandidates('https://libraries.minecraft.net/')
    expect(new Set(list).size).toBe(list.length)
  })
})

describe('mavenUrl', () => {
  it('склеивает базу и путь без двойных слешей', () => {
    expect(mavenUrl('https://libraries.minecraft.net', 'com.mojang:logging:1.5.10')).toBe(
      'https://libraries.minecraft.net/com/mojang/logging/1.5.10/logging-1.5.10.jar'
    )
  })
})

describe('libraryKey', () => {
  it('игнорирует версию, но учитывает classifier', () => {
    expect(libraryKey('org.lwjgl:lwjgl:3.3.3')).toBe('org.lwjgl:lwjgl')
    expect(libraryKey('org.lwjgl:lwjgl:3.3.2')).toBe('org.lwjgl:lwjgl')
    expect(libraryKey('org.lwjgl:lwjgl:3.3.3:natives-windows')).toBe('org.lwjgl:lwjgl:natives-windows')
  })
})
