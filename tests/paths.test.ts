import { describe, expect, it } from 'vitest'
import {
  assertPathLength,
  assetObjectPath,
  buildPaths,
  driveOf,
  instanceSubdir,
  isOneDrivePath,
  isPathTooLong,
  javaExecutable,
  libraryPath,
  safeJoin,
  sanitizeSegment,
  versionJarPath,
  versionJsonPath
} from '@main/core/paths'
import { RayError } from '@shared/errors'

const userData = 'C:\\Users\\Игрок\\AppData\\Roaming\\RayLauncher'
const layout = buildPaths(userData)

describe('buildPaths', () => {
  it('раскладывает каталоги внутри %APPDATA%/RayLauncher', () => {
    expect(layout.games).toBe(`${userData}\\games`)
    expect(layout.versions).toBe(`${userData}\\games\\versions`)
    expect(layout.libraries).toBe(`${userData}\\games\\libraries`)
    expect(layout.assetObjects).toBe(`${userData}\\games\\assets\\objects`)
    expect(layout.jre).toBe(`${userData}\\games\\jre`)
    expect(layout.logs).toBe(`${userData}\\logs`)
  })

  it('уважает пользовательский каталог игр на другом диске', () => {
    const custom = buildPaths(userData, 'D:\\Games\\RayLauncher')
    expect(custom.versions).toBe('D:\\Games\\RayLauncher\\versions')
    expect(custom.userData).toBe(userData)
    expect(driveOf(custom.games)).toBe('D:')
  })

  it('работает с путями с пробелами и кириллицей', () => {
    const custom = buildPaths('C:\\Users\\Иван Петров\\AppData\\Roaming\\RayLauncher')
    expect(custom.assets).toBe('C:\\Users\\Иван Петров\\AppData\\Roaming\\RayLauncher\\games\\assets')
  })
})

describe('пути версий и инстансов', () => {
  it('версия лежит в собственной папке', () => {
    expect(versionJsonPath('26.2', layout)).toBe(`${layout.versions}\\26.2\\26.2.json`)
    expect(versionJarPath('26.2', layout)).toBe(`${layout.versions}\\26.2\\26.2.jar`)
  })

  it('инстанс профиля изолирован от общих файлов', () => {
    expect(instanceSubdir('a1b2', 'mods', layout)).toBe(`${layout.instances}\\a1b2\\mods`)
    expect(instanceSubdir('a1b2', 'natives', layout)).toBe(`${layout.instances}\\a1b2\\natives`)
  })

  it('библиотека адресуется maven-координатами, а не профилем', () => {
    expect(libraryPath('com/mojang/logging/1.5.10/logging-1.5.10.jar', layout)).toBe(
      `${layout.libraries}\\com\\mojang\\logging\\1.5.10\\logging-1.5.10.jar`
    )
  })

  it('ресурс кладётся в подпапку из первых двух символов хеша', () => {
    const hash = 'c12254b8b1b2f1b8f0b3a4f5d6e7c8a9b0c1d2e3'
    expect(assetObjectPath(hash, layout)).toBe(`${layout.assetObjects}\\c1\\${hash}`)
  })

  it('отвергает некорректный хеш ресурса', () => {
    expect(() => assetObjectPath('../../etc/passwd', layout)).toThrow(RayError)
  })

  it('java.exe ищется внутри компонента рантайма', () => {
    expect(javaExecutable('java-runtime-epsilon', layout)).toBe(
      `${layout.jre}\\java-runtime-epsilon\\bin\\java.exe`
    )
  })
})

describe('sanitizeSegment', () => {
  it('вычищает разделители и управляющие символы', () => {
    expect(sanitizeSegment('..\\..\\windows')).toBe('____windows')
    expect(sanitizeSegment('my:profile')).toBe('my_profile')
  })

  it('обезвреживает зарезервированные имена Windows', () => {
    expect(sanitizeSegment('CON')).toBe('_CON')
    expect(sanitizeSegment('lpt1')).toBe('_lpt1')
  })

  it('не оставляет точку или пробел в конце имени', () => {
    expect(sanitizeSegment('profile.')).toBe('profile')
    expect(sanitizeSegment('profile ')).toBe('profile')
    expect(sanitizeSegment('...')).toBe('_')
  })

  it('сохраняет кириллицу и пробелы внутри имени', () => {
    expect(sanitizeSegment('Мой профиль')).toBe('Мой профиль')
  })
})

describe('safeJoin', () => {
  it('склеивает сегменты внутри корня', () => {
    expect(safeJoin('C:\\games', 'versions', '26.2')).toBe('C:\\games\\versions\\26.2')
  })

  it('не выпускает за пределы корня', () => {
    expect(() => safeJoin('C:\\games', '..', 'windows')).toThrow(RayError)
    expect(() => safeJoin('C:\\games', 'versions\\..\\..\\secrets')).toThrow(RayError)
  })

  it('запрещает абсолютный путь в сегменте', () => {
    expect(() => safeJoin('C:\\games', 'C:\\windows\\system32')).toThrow(RayError)
  })

  it('не путает каталоги с общим префиксом', () => {
    expect(() => safeJoin('C:\\games', '..\\games-old\\x')).toThrow(RayError)
  })
})

describe('ограничения Windows', () => {
  it('ловит слишком длинный путь', () => {
    const long = `C:\\games\\${'папка\\'.repeat(40)}file.jar`
    expect(isPathTooLong(long)).toBe(true)
    expect(() => assertPathLength(long)).toThrow(RayError)
  })

  it('обычный путь проходит проверку', () => {
    expect(isPathTooLong(versionJarPath('26.2', layout))).toBe(false)
    expect(() => assertPathLength(versionJarPath('26.2', layout))).not.toThrow()
  })

  it('распознаёт перенаправленный в OneDrive профиль', () => {
    expect(isOneDrivePath('C:\\Users\\Игрок\\OneDrive\\Документы\\RayLauncher')).toBe(true)
    expect(isOneDrivePath('C:\\Users\\Игрок\\AppData\\Roaming\\RayLauncher')).toBe(false)
  })
})
