import { describe, expect, it } from 'vitest'
import {
  buildGameArguments,
  buildJvmArguments,
  buildLaunchArgv,
  buildPlaceholders,
  collectArguments,
  expandPlaceholders,
  launchFeatures
} from '../src/main/minecraft/arguments'
import { currentRuleContext } from '../src/main/minecraft/rules'
import type { VersionJson } from '../src/main/minecraft/versionJson'

const values = buildPlaceholders({
  versionName: '26.2',
  versionType: 'release',
  gameDir: 'C:\\Games\\RayLauncher\\instances\\quick',
  assetsRoot: 'C:\\Games\\RayLauncher\\assets',
  assetsIndexName: '32',
  nativesDir: 'C:\\Games\\RayLauncher\\instances\\quick\\natives',
  classpath: 'a.jar;b.jar',
  libraryDirectory: 'C:\\Games\\RayLauncher\\libraries',
  clientJar: 'C:\\Games\\RayLauncher\\versions\\26.2\\26.2.jar',
  playerName: 'Player',
  uuid: 'a01e3843e5213998958af459800e4d11',
  accessToken: 'token-value',
  userType: 'legacy',
  launcherName: 'RayLauncher',
  launcherVersion: '1.0.0'
})

const context = currentRuleContext('x64', '10.0.26100')

describe('expandPlaceholders', () => {
  it('подставляет значение внутри строки, а не только целиком', () => {
    expect(expandPlaceholders('-Dminecraft.launcher.brand=${launcher_name}', values)).toBe(
      '-Dminecraft.launcher.brand=RayLauncher'
    )
  })

  it('подставляет несколько плейсхолдеров в одной строке', () => {
    expect(expandPlaceholders('${launcher_name}/${launcher_version}', values)).toBe('RayLauncher/1.0.0')
  })

  it('оставляет неизвестный плейсхолдер как есть, чтобы ошибка была заметна', () => {
    expect(expandPlaceholders('--flag ${unknown_thing}', values)).toBe('--flag ${unknown_thing}')
  })

  it('не портит пути с пробелами и кириллицей', () => {
    const custom = buildPlaceholders({
      ...basePlaceholderInput,
      gameDir: 'C:\\Игры\\Мой профиль'
    })
    expect(expandPlaceholders('--gameDir ${game_directory}', custom)).toBe(
      '--gameDir C:\\Игры\\Мой профиль'
    )
  })
})

describe('collectArguments', () => {
  it('разворачивает строковые аргументы и массивы value', () => {
    const result = collectArguments(
      ['--username', '${auth_player_name}', { value: ['--width', '1280'] }],
      context,
      values
    )
    expect(result).toEqual(['--username', 'Player', '--width', '1280'])
  })

  it('отбрасывает аргумент, если правило не подошло по ОС', () => {
    const result = collectArguments(
      [{ rules: [{ action: 'allow', os: { name: 'osx' } }], value: '-XstartOnFirstThread' }],
      context,
      values
    )
    expect(result).toEqual([])
  })

  it('оставляет windows-аргумент с версией ОС', () => {
    const result = collectArguments(
      [
        {
          rules: [{ action: 'allow', os: { name: 'windows', version: '^10\\.' } }],
          value: '-Dos.name=Windows 10'
        }
      ],
      context,
      values
    )
    expect(result).toEqual(['-Dos.name=Windows 10'])
  })

  it('учитывает features: своё разрешение включается только при флаге', () => {
    const argument = [
      {
        rules: [{ action: 'allow' as const, features: { has_custom_resolution: true } }],
        value: ['--width', '${resolution_width}']
      }
    ]

    const off = currentRuleContext('x64', '10.0.26100', launchFeatures({}))
    const on = currentRuleContext('x64', '10.0.26100', launchFeatures({ customResolution: true }))

    expect(collectArguments(argument, off, values)).toEqual([])
    expect(
      collectArguments(argument, on, buildPlaceholders({ ...basePlaceholderInput, resolutionWidth: 1280 }))
    ).toEqual(['--width', '1280'])
  })

  it('демо-аргумент появляется только у демо-пользователя', () => {
    const argument = [
      { rules: [{ action: 'allow' as const, features: { is_demo_user: true } }], value: '--demo' }
    ]
    expect(collectArguments(argument, currentRuleContext('x64', '10.0', launchFeatures({})), values)).toEqual(
      []
    )
    expect(
      collectArguments(
        argument,
        currentRuleContext('x64', '10.0', launchFeatures({ demo: true })),
        values
      )
    ).toEqual(['--demo'])
  })
})

describe('buildJvmArguments', () => {
  it('берёт объявленные аргументы версии', () => {
    const version = {
      id: '26.2',
      arguments: { jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'] }
    } as VersionJson

    expect(buildJvmArguments(version, context, values)).toEqual([
      '-Djava.library.path=C:\\Games\\RayLauncher\\instances\\quick\\natives',
      '-cp',
      'a.jar;b.jar'
    ])
  })

  it('для версий до 1.13 собирает набор сам', () => {
    const version = { id: '1.12.2', minecraftArguments: '--username ${auth_player_name}' } as VersionJson
    const result = buildJvmArguments(version, context, values)

    expect(result).toContain('-cp')
    expect(result).toContain('a.jar;b.jar')
    expect(result[0]).toBe('-Djava.library.path=C:\\Games\\RayLauncher\\instances\\quick\\natives')
  })
})

describe('buildGameArguments', () => {
  it('разбирает legacy-строку minecraftArguments', () => {
    const version = {
      id: '1.12.2',
      minecraftArguments:
        '--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${game_assets} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userType ${user_type}'
    } as VersionJson

    expect(buildGameArguments(version, context, values)).toEqual([
      '--username',
      'Player',
      '--version',
      '26.2',
      '--gameDir',
      'C:\\Games\\RayLauncher\\instances\\quick',
      '--assetsDir',
      'C:\\Games\\RayLauncher\\assets',
      '--uuid',
      'a01e3843e5213998958af459800e4d11',
      '--accessToken',
      'token-value',
      '--userType',
      'legacy'
    ])
  })

  it('новый формат имеет приоритет над minecraftArguments', () => {
    const version = {
      id: 'mixed',
      minecraftArguments: '--username ${auth_player_name}',
      arguments: { game: ['--uuid', '${auth_uuid}'] }
    } as VersionJson

    expect(buildGameArguments(version, context, values)).toEqual([
      '--uuid',
      'a01e3843e5213998958af459800e4d11'
    ])
  })
})

describe('buildLaunchArgv', () => {
  const version = {
    id: '26.2',
    mainClass: 'net.minecraft.client.main.Main',
    arguments: {
      jvm: ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'],
      game: ['--username', '${auth_player_name}', '--version', '${version_name}']
    }
  } as VersionJson

  it('ставит память первой, а главный класс — перед игровыми аргументами', () => {
    const argv = buildLaunchArgv({
      version,
      context,
      values,
      memoryMinMb: 2048,
      memoryMaxMb: 4096
    })

    expect(argv[0]).toBe('-Xms2048M')
    expect(argv[1]).toBe('-Xmx4096M')

    const mainIndex = argv.indexOf('net.minecraft.client.main.Main')
    expect(mainIndex).toBeGreaterThan(argv.indexOf('-cp'))
    expect(argv.indexOf('--username')).toBeGreaterThan(mainIndex)
  })

  it('добавляет кодировки UTF-8, иначе русский лог превращается в мусор', () => {
    const argv = buildLaunchArgv({ version, context, values, memoryMinMb: 1024, memoryMaxMb: 2048 })
    expect(argv).toContain('-Dfile.encoding=UTF-8')
    expect(argv).toContain('-Dstdout.encoding=UTF-8')
  })

  it('пользовательские JVM-аргументы идут после наших, чтобы их можно было перебить', () => {
    const argv = buildLaunchArgv({
      version,
      context,
      values,
      memoryMinMb: 1024,
      memoryMaxMb: 2048,
      extraJvmArgs: ['-Xmx8192M', '-XX:+UseG1GC']
    })

    expect(argv.lastIndexOf('-Xmx8192M')).toBeGreaterThan(argv.indexOf('-Xmx2048M'))
    expect(argv.indexOf('-XX:+UseG1GC')).toBeLessThan(argv.indexOf('net.minecraft.client.main.Main'))
  })

  it('подставляет плейсхолдеры в аргумент журналирования', () => {
    const argv = buildLaunchArgv({
      version,
      context,
      values,
      memoryMinMb: 1024,
      memoryMaxMb: 2048,
      loggingArgument: '-Dlog4j.configurationFile=${path}'
    })
    expect(argv).toContain('-Dlog4j.configurationFile=${path}')
  })

  it('без mainClass падать нельзя — берём класс ванильного клиента', () => {
    const argv = buildLaunchArgv({
      version: { id: 'broken' } as VersionJson,
      context,
      values,
      memoryMinMb: 1024,
      memoryMaxMb: 1024
    })
    expect(argv).toContain('net.minecraft.client.main.Main')
  })
})

const basePlaceholderInput = {
  versionName: '26.2',
  versionType: 'release',
  gameDir: 'C:\\Games\\RayLauncher\\instances\\quick',
  assetsRoot: 'C:\\Games\\RayLauncher\\assets',
  assetsIndexName: '32',
  nativesDir: 'C:\\Games\\RayLauncher\\instances\\quick\\natives',
  classpath: 'a.jar;b.jar',
  libraryDirectory: 'C:\\Games\\RayLauncher\\libraries',
  clientJar: 'C:\\Games\\RayLauncher\\versions\\26.2\\26.2.jar',
  playerName: 'Player',
  uuid: 'a01e3843e5213998958af459800e4d11',
  accessToken: 'token-value',
  userType: 'legacy',
  launcherName: 'RayLauncher',
  launcherVersion: '1.0.0'
}
