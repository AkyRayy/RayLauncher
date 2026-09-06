import type { RuleContext } from './rules'
import { evaluateRules } from './rules'
import type { LaunchArgument, VersionJson } from './versionJson'
import { CLASSPATH_SEPARATOR } from './classpath'

export type Placeholders = Record<string, string>

export interface PlaceholderInput {
  versionName: string
  versionType: string
  gameDir: string
  assetsRoot: string
  assetsIndexName: string
  gameAssets?: string
  nativesDir: string
  classpath: string
  libraryDirectory: string
  clientJar: string
  playerName: string
  uuid: string
  accessToken: string
  userType: string
  xuid?: string
  clientId?: string
  launcherName: string
  launcherVersion: string
  resolutionWidth?: number
  resolutionHeight?: number
  quickPlayPath?: string
  quickPlaySingleplayer?: string
  quickPlayMultiplayer?: string
}

export function buildPlaceholders(input: PlaceholderInput): Placeholders {
  return {
    natives_directory: input.nativesDir,
    launcher_name: input.launcherName,
    launcher_version: input.launcherVersion,
    classpath: input.classpath,
    classpath_separator: CLASSPATH_SEPARATOR,
    library_directory: input.libraryDirectory,
    primary_jar: input.clientJar,
    primary_jar_name: input.clientJar,
    version_name: input.versionName,

    auth_player_name: input.playerName,
    auth_uuid: input.uuid,
    auth_access_token: input.accessToken,
    auth_session: `token:${input.accessToken}:${input.uuid}`,
    auth_xuid: input.xuid ?? '',
    clientid: input.clientId ?? '',
    user_type: input.userType,
    user_properties: '{}',
    version_type: input.versionType,
    game_directory: input.gameDir,
    assets_root: input.assetsRoot,
    assets_index_name: input.assetsIndexName,
    game_assets: input.gameAssets ?? input.assetsRoot,
    resolution_width: `${input.resolutionWidth ?? ''}`,
    resolution_height: `${input.resolutionHeight ?? ''}`,
    quickPlayPath: input.quickPlayPath ?? '',
    quickPlaySingleplayer: input.quickPlaySingleplayer ?? '',
    quickPlayMultiplayer: input.quickPlayMultiplayer ?? '',
    quickPlayRealms: ''
  }
}

export function expandPlaceholders(value: string, values: Placeholders): string {
  return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (match, key: string) => values[key] ?? match)
}

export function collectArguments(
  list: readonly LaunchArgument[] | undefined,
  context: RuleContext,
  values: Placeholders
): string[] {
  if (!list) return []

  const result: string[] = []
  for (const item of list) {
    if (typeof item === 'string') {
      result.push(expandPlaceholders(item, values))
      continue
    }
    if (!evaluateRules(item.rules, context)) continue

    const parts = Array.isArray(item.value) ? item.value : [item.value]
    for (const part of parts) result.push(expandPlaceholders(part, values))
  }
  return result
}

export function buildJvmArguments(
  version: VersionJson,
  context: RuleContext,
  values: Placeholders
): string[] {
  const declared = collectArguments(version.arguments?.jvm, context, values)
  if (declared.length > 0) return declared

  return [
    `-Djava.library.path=${values.natives_directory ?? ''}`,
    `-Dminecraft.launcher.brand=${values.launcher_name ?? ''}`,
    `-Dminecraft.launcher.version=${values.launcher_version ?? ''}`,
    '-cp',
    values.classpath ?? ''
  ]
}

export function buildGameArguments(
  version: VersionJson,
  context: RuleContext,
  values: Placeholders
): string[] {
  if (version.arguments?.game) return collectArguments(version.arguments.game, context, values)

  const legacy = version.minecraftArguments
  if (!legacy) return []

  return legacy
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => expandPlaceholders(token, values))
}

export interface LaunchArgvInput {
  version: VersionJson
  context: RuleContext
  values: Placeholders
  memoryMinMb: number
  memoryMaxMb: number
  extraJvmArgs?: readonly string[]
  extraGameArgs?: readonly string[]
  loggingArgument?: string
}

export function buildLaunchArgv(input: LaunchArgvInput): string[] {
  const { version, context, values } = input

  const memory = [`-Xms${input.memoryMinMb}M`, `-Xmx${input.memoryMaxMb}M`]

  const encoding = [
    '-Dfile.encoding=UTF-8',
    '-Dstdout.encoding=UTF-8',
    '-Dstderr.encoding=UTF-8',
    '-Dsun.stdout.encoding=UTF-8',
    '-Dsun.stderr.encoding=UTF-8'
  ]

  const jvm = buildJvmArguments(version, context, values)
  const game = buildGameArguments(version, context, values)
  const mainClass = version.mainClass ?? 'net.minecraft.client.main.Main'

  return [
    ...memory,
    ...encoding,
    ...(input.loggingArgument ? [expandPlaceholders(input.loggingArgument, values)] : []),
    ...(input.extraJvmArgs ?? []),
    ...jvm,
    mainClass,
    ...game,
    ...(input.extraGameArgs ?? [])
  ]
}

export function launchFeatures(options: {
  demo?: boolean
  customResolution?: boolean
  quickPlayPath?: string
  quickPlaySingleplayer?: string
  quickPlayMultiplayer?: string
}): Record<string, boolean> {
  const quickPlay =
    options.quickPlayPath !== undefined ||
    options.quickPlaySingleplayer !== undefined ||
    options.quickPlayMultiplayer !== undefined

  return {
    is_demo_user: options.demo === true,
    has_custom_resolution: options.customResolution === true,
    has_quick_plays_support: quickPlay,
    is_quick_play_singleplayer: options.quickPlaySingleplayer !== undefined,
    is_quick_play_multiplayer: options.quickPlayMultiplayer !== undefined,
    is_quick_play_realms: false
  }
}
