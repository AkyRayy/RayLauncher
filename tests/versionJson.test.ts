import { describe, expect, it } from 'vitest'
import {
  dedupeLibraries,
  javaComponentOf,
  mergeVersionJson,
  versionJsonSchema,
  type Library,
  type VersionJson
} from '@main/minecraft/versionJson'

const vanilla: VersionJson = {
  id: '26.2',
  type: 'release',
  mainClass: 'net.minecraft.client.main.Main',
  releaseTime: '2026-06-16T12:03:33+00:00',
  javaVersion: { component: 'java-runtime-epsilon', majorVersion: 25 },
  assets: '32',
  assetIndex: { id: '32', sha1: 'c12254b', url: 'https://piston-meta.mojang.com/v1/packages/x/32.json' },
  downloads: { client: { sha1: 'abc', size: 27_000_000, url: 'https://piston-data/client.jar' } },
  libraries: [
    { name: 'com.mojang:logging:1.5.10' },
    { name: 'org.lwjgl:lwjgl:3.3.3' },
    { name: 'com.google.guava:guava:33.0.0' }
  ],
  arguments: {
    game: ['--username', '${auth_player_name}'],
    jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}']
  },
  logging: {
    client: {
      argument: '-Dlog4j.configurationFile=${path}',
      type: 'log4j2-xml',
      file: { id: 'client-1.12.xml', sha1: 'def', size: 888, url: 'https://piston/log4j.xml' }
    }
  }
}

const fabric: VersionJson = {
  id: 'fabric-loader-0.19.5-26.2',
  inheritsFrom: '26.2',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  libraries: [
    { name: 'net.fabricmc:fabric-loader:0.19.5', url: 'https://maven.fabricmc.net/' },
    { name: 'com.google.guava:guava:33.4.0' }
  ],
  arguments: { jvm: ['-DFabricMcEmu=net.minecraft.client.main.Main'] }
}

describe('mergeVersionJson', () => {
  const merged = mergeVersionJson(fabric, vanilla)

  it('сохраняет идентификатор ребёнка и убирает inheritsFrom', () => {
    expect(merged.id).toBe('fabric-loader-0.19.5-26.2')
    expect(merged.inheritsFrom).toBeUndefined()
  })

  it('берёт mainClass ребёнка, а остальные скаляры — от родителя', () => {
    expect(merged.mainClass).toBe('net.fabricmc.loader.impl.launch.knot.KnotClient')
    expect(merged.type).toBe('release')
    expect(merged.releaseTime).toBe('2026-06-16T12:03:33+00:00')
  })

  it('наследует assets, downloads, logging и javaVersion', () => {
    expect(merged.assetIndex?.id).toBe('32')
    expect(merged.assets).toBe('32')
    expect(merged.downloads?.client?.url).toBe('https://piston-data/client.jar')
    expect(merged.logging?.client?.type).toBe('log4j2-xml')
    expect(merged.javaVersion).toEqual({ component: 'java-runtime-epsilon', majorVersion: 25 })
  })

  it('ставит библиотеки ребёнка первыми и выкидывает дубли по group:artifact', () => {
    const names = merged.libraries?.map((library) => library.name) ?? []
    expect(names[0]).toBe('net.fabricmc:fabric-loader:0.19.5')
    expect(names).toContain('com.google.guava:guava:33.4.0')
    expect(names).not.toContain('com.google.guava:guava:33.0.0')
    expect(names).toHaveLength(4)
  })

  it('склеивает аргументы: родитель первым, ребёнок следом', () => {
    expect(merged.arguments?.jvm).toEqual([
      '-Djava.library.path=${natives_directory}',
      '-cp',
      '${classpath}',
      '-DFabricMcEmu=net.minecraft.client.main.Main'
    ])
    expect(merged.arguments?.game).toEqual(['--username', '${auth_player_name}'])
  })

  it('client.jar берётся из родителя, когда у ребёнка нет своего', () => {
    expect(merged.jar).toBe('26.2')
  })

  it('не портит исходные объекты', () => {
    expect(fabric.libraries).toHaveLength(2)
    expect(vanilla.libraries).toHaveLength(3)
  })

  it('minecraftArguments ребёнка перекрывает родительские', () => {
    const legacyParent: VersionJson = { id: '1.12.2', minecraftArguments: '--username ${auth_player_name}' }
    const legacyChild: VersionJson = {
      id: 'forge-1.12.2',
      inheritsFrom: '1.12.2',
      minecraftArguments: '--username ${auth_player_name} --tweakClass forge'
    }
    expect(mergeVersionJson(legacyChild, legacyParent).minecraftArguments).toContain('--tweakClass forge')
  })
})

describe('dedupeLibraries', () => {
  it('различает библиотеки по classifier', () => {
    const libraries: Library[] = [
      { name: 'org.lwjgl:lwjgl:3.3.3' },
      { name: 'org.lwjgl:lwjgl:3.3.3:natives-windows' },
      { name: 'org.lwjgl:lwjgl:3.3.2' }
    ]
    const result = dedupeLibraries(libraries).map((library) => library.name)
    expect(result).toEqual(['org.lwjgl:lwjgl:3.3.3', 'org.lwjgl:lwjgl:3.3.3:natives-windows'])
  })
})

describe('javaComponentOf', () => {
  it('возвращает компонент из описания версии', () => {
    expect(javaComponentOf(vanilla)).toEqual({ component: 'java-runtime-epsilon', majorVersion: 25 })
  })

  it('для старых версий без javaVersion падает на Java 8', () => {
    expect(javaComponentOf({ id: '1.12.2' })).toEqual({ component: 'jre-legacy', majorVersion: 8 })
  })
})

describe('versionJsonSchema', () => {
  it('принимает аргумент-строку, массив и объект с правилами', () => {
    const parsed = versionJsonSchema.parse({
      id: '1.21.11',
      arguments: {
        game: [
          '--demo',
          { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' },
          {
            rules: [{ action: 'allow', features: { has_custom_resolution: true } }],
            value: ['--width', '${resolution_width}']
          }
        ]
      }
    })
    expect(parsed.arguments?.game).toHaveLength(3)
  })

  it('принимает описание без arguments (версии ≤ 1.12)', () => {
    const parsed = versionJsonSchema.parse({
      id: '1.7.10',
      minecraftArguments: '--username ${auth_player_name} --version ${version_name}'
    })
    expect(parsed.arguments).toBeUndefined()
    expect(parsed.minecraftArguments).toContain('${auth_player_name}')
  })
})
