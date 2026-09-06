import { describe, expect, it } from 'vitest'
import { planClientJar, planLibraries } from '@main/minecraft/libraries'
import type { VersionJson } from '@main/minecraft/versionJson'
import type { RuleContext } from '@main/minecraft/rules'

const windows: RuleContext = {
  osName: 'windows',
  osVersion: '10.0.26100',
  osArch: 'x86_64',
  features: {}
}

const root = 'C:\\games\\libraries'

const version: VersionJson = {
  id: '26.2',
  libraries: [
    {
      name: 'com.mojang:logging:1.5.10',
      downloads: {
        artifact: {
          path: 'com/mojang/logging/1.5.10/logging-1.5.10.jar',
          sha1: 'aaa',
          size: 1024,
          url: 'https://libraries.minecraft.net/com/mojang/logging/1.5.10/logging-1.5.10.jar'
        }
      }
    },
    {
      name: 'ca.weblite:java-objc-bridge:1.1',
      rules: [{ action: 'allow', os: { name: 'osx' } }],
      downloads: {
        artifact: { path: 'ca/weblite/x.jar', sha1: 'bbb', size: 10, url: 'https://libraries/x.jar' }
      }
    },
    {
      name: 'org.lwjgl.lwjgl:lwjgl-platform:2.9.4',
      natives: { windows: 'natives-windows', osx: 'natives-osx' },
      extract: { exclude: ['META-INF/', 'unused/'] },
      downloads: {
        classifiers: {
          'natives-windows': {
            path: 'org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-windows.jar',
            sha1: 'ccc',
            size: 2048,
            url: 'https://libraries.minecraft.net/lwjgl-natives-windows.jar'
          }
        }
      }
    },
    {
      name: 'net.fabricmc:fabric-loader:0.19.5',
      url: 'https://maven.fabricmc.net/'
    }
  ]
}

describe('planLibraries', () => {
  const plan = planLibraries(version, windows, root)

  it('отбрасывает библиотеки, не прошедшие rules', () => {
    expect(plan.downloads.some((spec) => spec.url.includes('ca/weblite'))).toBe(false)
  })

  it('строит путь из maven-координат и кладёт файл в общий каталог библиотек', () => {
    const logging = plan.downloads.find((spec) => spec.label === 'logging-1.5.10.jar')
    expect(logging?.dest).toBe(`${root}\\com\\mojang\\logging\\1.5.10\\logging-1.5.10.jar`)
    expect(logging?.sha1).toBe('aaa')
  })

  it('для библиотеки без downloads подставляет её собственный репозиторий', () => {
    const loader = plan.downloads.find((spec) => spec.label === 'fabric-loader-0.19.5.jar')
    expect(loader?.url).toBe(
      'https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.5/fabric-loader-0.19.5.jar'
    )
    expect(loader?.fallbackUrls?.[0]).toContain('libraries.minecraft.net')
  })

  it('добавляет natives по classifier текущей ОС и сохраняет маски исключения', () => {
    expect(plan.natives).toHaveLength(1)
    expect(plan.natives[0]?.jarPath).toContain('lwjgl-platform-2.9.4-natives-windows.jar')
    expect(plan.natives[0]?.exclude).toEqual(['META-INF/', 'unused/'])
  })

  it('не тащит natives-контейнер в classpath', () => {
    expect(plan.classpath.some((entry) => entry.includes('natives-windows'))).toBe(false)
    expect(plan.classpath).toHaveLength(2)
  })

  it('на arm64 берёт другой classifier natives', () => {
    const armVersion: VersionJson = {
      id: '26.2',
      libraries: [
        {
          name: 'org.lwjgl:lwjgl:3.3.3',
          natives: { windows: 'natives-windows-${arch}' },
          downloads: {
            artifact: { path: 'org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3.jar', sha1: 'd', size: 1, url: 'https://l/lwjgl.jar' }
          }
        }
      ]
    }
    const armPlan = planLibraries(armVersion, { ...windows, osArch: 'arm64' }, root)
    expect(armPlan.natives[0]?.jarPath).toContain('lwjgl-3.3.3-natives-windows-arm64.jar')
  })

  it('не дублирует один и тот же файл', () => {
    const duplicated: VersionJson = {
      id: 'x',
      libraries: [version.libraries![0]!, version.libraries![0]!]
    }
    expect(planLibraries(duplicated, windows, root).downloads).toHaveLength(1)
  })
})

describe('planClientJar', () => {
  it('возвращает задачу для client.jar', () => {
    const spec = planClientJar(
      { id: '26.2', downloads: { client: { sha1: 'abc', size: 27_000_000, url: 'https://piston/client.jar' } } },
      'C:\\games\\versions\\26.2\\26.2.jar'
    )
    expect(spec).toMatchObject({ kind: 'client-jar', sha1: 'abc', size: 27_000_000 })
  })

  it('возвращает null, если ссылки на клиент нет (профиль загрузчика)', () => {
    expect(planClientJar({ id: 'fabric' }, 'C:\\x.jar')).toBeNull()
  })
})
