import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { copyFile, readFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { app } from 'electron'
import { APP_NAME, CRASH } from '@shared/constants'
import { RayError } from '@shared/errors'
import type { Account, CrashVerdict, GameState, LogLevel } from '@shared/types'
import { emitEvent } from '../core/events'
import { ensureDir, pathExists } from '../core/fsx'
import { instanceDir, instanceSubdir, paths } from '../core/paths'
import { logger } from '../logger'
import { getSettings } from '../store/settings.store'
import { recordExit, recordLaunch } from '../db/stats.repo'
import { buildLaunchArgv, buildPlaceholders, launchFeatures } from './arguments'
import { buildClasspath, commandLineLength, MAX_COMMAND_LINE } from './classpath'
import { findCrashReport } from './crashReport'
import { analyzeCrashReport, codeFromExit, withReport } from './crashAnalyzer'
import { installVersion, type InstallResult } from './installer'
import {
  createLogParser,
  detectFatalReason,
  looksLikeCrash,
  looksLikeGameReady,
  type ParsedLine
} from './logParser'
import { planAssets, virtualAssetLinks } from './assets'
import { currentRuleContext } from './rules'
import { probeJava, resolveJavaExecutable, assertJavaMajor } from './java/detect'
import { ensureInjector, injectorJvmArgs } from '../auth/authlibInjector'
import { fetchPrefetched } from '../auth/yggdrasil'
import { registerLocalProfile, startLocalYggdrasil } from '../auth/localYggdrasil'
import { defaultVariantForUuid } from '../auth/skins'

export interface LaunchRequest {
  profileId: string
  versionId: string
  account: Account
  memoryMinMb: number
  memoryMaxMb: number
  jvmArgs?: readonly string[]
  gameArgs?: readonly string[]
  window?: { width: number; height: number; fullscreen: boolean }
  javaPath?: string
  demo?: boolean
}

interface RunningGame {
  state: GameState
  child: ChildProcessWithoutNullStreams
  startedAt: number
  lastLogAt: number
  sawCrash: boolean
  fatalCode: 'JAVA_VERSION_MISMATCH' | 'GAME_CRASHED' | null
}

const running = new Map<string, RunningGame>()
const verdicts = new Map<string, CrashVerdict>()

let lastState: GameState | null = null

type StateListener = (state: GameState) => void

const stateListeners = new Set<StateListener>()

export function onGameState(listener: StateListener): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}

export function currentGameState(): GameState | null {
  return lastState
}

export function isRunning(profileId: string): boolean {
  return running.has(profileId)
}

/** Последний вердикт анализатора: для профиля или самый свежий из всех. */
export function getVerdict(profileId?: string): CrashVerdict | null {
  if (profileId) return verdicts.get(profileId) ?? null
  const values = [...verdicts.values()]
  return values.length > 0 ? (values[values.length - 1] as CrashVerdict) : null
}

export async function launchGame(request: LaunchRequest): Promise<GameState> {
  if (running.has(request.profileId)) {
    throw new RayError('GAME_ALREADY_RUNNING', 'Игра уже запущена для этого профиля', {
      profileId: request.profileId
    })
  }

  const { profileId, versionId } = request
  publish({ profileId, phase: 'preparing' })
  logger.info(`Запуск ${versionId} (профиль ${profileId}) от имени ${request.account.username}`)

  try {
    publish({ profileId, phase: 'downloading' })
    const install = await installVersion(versionId, { profileId })

    const gameDir = instanceDir(profileId)
    await prepareInstanceDirs(profileId)
    const assetsRoot = await prepareAssets(install, profileId)

    const javaPath = await resolveJava(request, install)
    const argv = await buildArgv(request, install, gameDir, assetsRoot)

    if (commandLineLength(javaPath, argv) > MAX_COMMAND_LINE) {
      throw new RayError(
        'PATH_TOO_LONG',
        'Команда запуска длиннее лимита Windows: перенесите папку игр ближе к корню диска'
      )
    }

    publish({ profileId, phase: 'launching' })
    return spawnGame(request, javaPath, argv, gameDir)
  } catch (error) {
    const rayError = RayError.from(error, 'INTERNAL')
    publish({ profileId, phase: 'crashed' })
    logger.error(`Запуск ${versionId} не удался: ${rayError.message}`)
    throw rayError
  }
}

export function stopGame(profileId: string): void {
  const game = running.get(profileId)
  if (!game) return

  logger.info(`Останавливаю игру профиля ${profileId} (pid ${game.child.pid ?? 0})`)
  game.child.kill()

  setTimeout(() => {
    if (running.has(profileId)) game.child.kill('SIGKILL')
  }, 5000).unref()
}

/** Мгновенное завершение зависшего процесса без ожидания. */
export function killGame(profileId: string): void {
  const game = running.get(profileId)
  if (!game) return

  logger.warn(`Принудительно завершаю игру профиля ${profileId} (pid ${game.child.pid ?? 0})`)
  game.child.kill('SIGKILL')
}

export function stopAllGames(): void {
  for (const profileId of [...running.keys()]) stopGame(profileId)
}

const WATCHDOG_INTERVAL_MS = 30_000
let watchdogTimer: NodeJS.Timeout | null = null

/** Сторож: гасит игру без признаков жизни дольше таймаута (опция, по умолчанию выкл). */
export function startWatchdog(): void {
  if (watchdogTimer) return
  watchdogTimer = setInterval(() => {
    let settings
    try {
      settings = getSettings()
    } catch {
      return
    }
    if (!settings.watchdogEnabled) return

    const limitMs = settings.watchdogTimeoutMin * 60_000
    for (const [profileId, game] of running) {
      if (game.state.phase !== 'running') continue
      if (Date.now() - game.lastLogAt < limitMs) continue
      logger.warn(
        `Игра профиля ${profileId} молчит ${settings.watchdogTimeoutMin} мин — считаю зависшей и завершаю`
      )
      stopGame(profileId)
    }
  }, WATCHDOG_INTERVAL_MS)
  watchdogTimer.unref()
}

export function stopWatchdog(): void {
  if (!watchdogTimer) return
  clearInterval(watchdogTimer)
  watchdogTimer = null
}

async function prepareInstanceDirs(profileId: string): Promise<void> {
  await ensureDir(instanceDir(profileId))
  for (const sub of ['mods', 'saves', 'config', 'logs', 'natives', 'crash-reports', 'resourcepacks'] as const) {
    await ensureDir(instanceSubdir(profileId, sub))
  }
}

async function prepareAssets(install: InstallResult, profileId: string): Promise<string> {
  const plan = await planAssets(install.version)
  if (!plan) return paths().assets
  if (!plan.index.virtual && !plan.index.map_to_resources) return paths().assets

  const resourcesDir = path.join(instanceDir(profileId), 'resources')
  const links = virtualAssetLinks(plan, resourcesDir)

  for (const link of links) {
    if (await pathExists(link.to)) continue
    if (!(await pathExists(link.from))) continue
    await ensureDir(path.dirname(link.to))
    await copyFile(link.from, link.to)
  }

  logger.debug(`Разложено ${links.length} ресурсов для legacy-индекса ${plan.indexId}`)
  return plan.index.map_to_resources ? paths().assets : path.join(paths().assets, 'virtual', plan.indexId)
}

async function resolveJava(request: LaunchRequest, install: InstallResult): Promise<string> {
  if (request.javaPath && request.javaPath.trim().length > 0) {
    const executable = await resolveJavaExecutable(request.javaPath)
    const probe = await probeJava(executable)
    assertJavaMajor(probe, install.javaMajor)
    return executable
  }

  if (install.javaPath.length === 0 || !(await pathExists(install.javaPath))) {
    throw new RayError('JAVA_MISSING', `Java ${install.javaMajor} не установлена`, {
      component: install.javaComponent
    })
  }
  return install.javaPath
}

async function buildArgv(
  request: LaunchRequest,
  install: InstallResult,
  gameDir: string,
  assetsRoot: string
): Promise<string[]> {
  const version = install.version
  const nativesDir = install.nativesDir ?? instanceSubdir(request.profileId, 'natives')
  await ensureDir(nativesDir)

  const custom =
    request.window !== undefined && !request.window.fullscreen && request.window.width > 0

  const context = currentRuleContext(
    process.arch,
    process.getSystemVersion(),
    launchFeatures({ demo: request.demo === true, customResolution: custom })
  )

  const values = buildPlaceholders({
    versionName: version.id,
    versionType: version.type ?? 'release',
    gameDir,
    assetsRoot,
    assetsIndexName: version.assets ?? version.assetIndex?.id ?? 'legacy',
    nativesDir,
    classpath: buildClasspath(install.classpath),
    libraryDirectory: paths().libraries,
    clientJar: install.clientJar,
    playerName: request.account.username,
    uuid: request.account.uuid,
    accessToken: request.account.accessToken,
    userType: request.account.kind === 'microsoft' ? 'msa' : 'legacy',
    ...(request.account.xuid ? { xuid: request.account.xuid } : {}),
    launcherName: APP_NAME,
    launcherVersion: app.getVersion(),
    ...(custom && request.window
      ? { resolutionWidth: request.window.width, resolutionHeight: request.window.height }
      : {})
  })

  const settings = getSettings()
  const agentArgs = await authAgentArgs(request.account)
  const extraGameArgs: string[] = []
  if (request.window?.fullscreen === true) extraGameArgs.push('--fullscreen')
  if (request.gameArgs) extraGameArgs.push(...request.gameArgs)

  return buildLaunchArgv({
    version,
    context,
    values,
    memoryMinMb: request.memoryMinMb,
    memoryMaxMb: request.memoryMaxMb,
    extraJvmArgs: [...agentArgs, ...settings.jvmArgs, ...(request.jvmArgs ?? [])],
    extraGameArgs,
    ...(install.loggingArgument ? { loggingArgument: install.loggingArgument } : {})
  })
}

async function authAgentArgs(account: Account): Promise<string[]> {
  if (account.kind === 'yggdrasil' && account.yggdrasil) {
    const jarPath = await ensureInjector()
    const prefetched = await fetchPrefetched(account.yggdrasil.apiRoot)
    logger.info(`Подключаю authlib-injector к ${account.yggdrasil.serverName}`)
    return injectorJvmArgs({ jarPath, apiRoot: account.yggdrasil.apiRoot, ...(prefetched ? { prefetched } : {}) })
  }

  const skinHash = account.skin?.hash
  if (account.kind !== 'guest' || !getSettings().offlineSkins || !skinHash) return []

  try {
    const jarPath = await ensureInjector()
    const apiRoot = await startLocalYggdrasil()
    registerLocalProfile({
      uuid: account.uuid,
      name: account.username,
      skinHash,
      variant: account.skin?.variant ?? defaultVariantForUuid(account.uuid)
    })
    return injectorJvmArgs({ jarPath, apiRoot })
  } catch (error) {
    logger.warn(
      `Офлайн-скин не подключён: ${error instanceof Error ? error.message : String(error)}. Запускаю без агента`
    )
    return []
  }
}

function spawnGame(
  request: LaunchRequest,
  javaPath: string,
  argv: string[],
  gameDir: string
): GameState {
  const { profileId } = request
  const startedAt = Date.now()

  const child = spawn(javaPath, argv, {
    cwd: gameDir,
    windowsHide: true,
    env: { ...process.env, APPDATA: process.env.APPDATA ?? '' }
  })

  const game: RunningGame = {
    state: { profileId, phase: 'launching', pid: child.pid ?? 0, startedAt },
    child,
    startedAt,
    lastLogAt: startedAt,
    sawCrash: false,
    fatalCode: null
  }
  running.set(profileId, game)
  publish(game.state)

  try {
    recordLaunch(profileId)
  } catch (error) {
    logger.debug(`Статистика не записана: ${error instanceof Error ? error.message : String(error)}`)
  }

  logger.info(`Процесс игры запущен: pid ${child.pid ?? 0}, аргументов ${argv.length}`)
  logger.debug(`Команда: ${javaPath} ${argv.map(hideSecrets).join(' ')}`)

  attachStream(game, child.stdout, 'info')
  attachStream(game, child.stderr, 'error')

  child.on('error', (error) => {
    running.delete(profileId)
    logger.error(`Не удалось запустить java.exe: ${error.message}`)
    publish({ profileId, phase: 'crashed' })
  })

  child.on('exit', (code, signal) => {
    void handleExit(request, game, code ?? (signal ? 143 : 0))
  })

  return game.state
}

function attachStream(
  game: RunningGame,
  stream: NodeJS.ReadableStream,
  fallbackLevel: LogLevel
): void {
  const parser = createLogParser()
  stream.setEncoding('utf8')

  stream.on('data', (chunk: string) => {
    for (const line of parser.feed(chunk)) emitLine(game, line, fallbackLevel)
  })
  stream.on('end', () => {
    for (const line of parser.flush()) emitLine(game, line, fallbackLevel)
  })
}

function emitLine(game: RunningGame, line: ParsedLine, fallbackLevel: LogLevel): void {
  const level = line.thread || line.logger ? line.level : fallbackLevel
  game.lastLogAt = Date.now()

  emitEvent('game:log', {
    source: game.state.profileId,
    level,
    time: line.time ?? Date.now(),
    text: line.text
  })

  if (game.state.phase === 'launching' && looksLikeGameReady(line)) {
    game.state = { ...game.state, phase: 'running' }
    publish(game.state)
  }
  if (looksLikeCrash(line)) game.sawCrash = true

  const fatal = detectFatalReason(line)
  if (fatal) game.fatalCode = fatal
}

async function handleExit(
  request: LaunchRequest,
  game: RunningGame,
  exitCode: number
): Promise<void> {
  const { profileId } = request
  running.delete(profileId)

  const sessionMs = Date.now() - game.startedAt
  const seconds = Math.round(sessionMs / 1000)
  const crashed = exitCode !== 0 || game.sawCrash

  try {
    recordExit(profileId, sessionMs, crashed)
  } catch (error) {
    logger.debug(`Статистика не записана: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!crashed) {
    logger.info(`Игра профиля ${profileId} закрыта штатно, время сессии ${seconds} с`)
    publish({ profileId, phase: 'stopped', exitCode, startedAt: game.startedAt })
    return
  }

  const report = await findCrashReport(profileId, game.startedAt).catch(() => null)
  logger.error(
    `Игра профиля ${profileId} завершилась с кодом ${exitCode}` +
      (report ? `: ${report.reason}` : game.fatalCode ? ` (${game.fatalCode})` : '')
  )

  if (report) {
    emitEvent('game:log', {
      source: profileId,
      level: 'error',
      time: Date.now(),
      text: `Причина падения: ${report.reason}`
    })
  }

  const verdict = await buildVerdict(profileId, exitCode, report?.path ?? null)
  if (verdict) {
    verdicts.set(profileId, verdict)
    logger.info(`Анализ краша ${profileId}: ${verdict.code}`)
  }

  publish({
    profileId,
    phase: 'crashed',
    exitCode,
    startedAt: game.startedAt,
    ...(report ? { crashReportPath: report.path } : {})
  })
}

async function buildVerdict(
  profileId: string,
  exitCode: number,
  reportPath: string | null
): Promise<CrashVerdict | null> {
  try {
    if (!reportPath) {
      const byExit = codeFromExit(exitCode)
      return withReport(
        byExit
          ? { code: byExit, suspects: [], fixes: byExit === 'EXIT_KILLED' ? [] : ['reveal-report'] }
          : { code: 'UNKNOWN', suspects: [], fixes: ['reveal-report'] },
        { exitCode }
      )
    }

    const content = await readFile(reportPath, 'utf8').catch(() => '')
    const analysis = analyzeCrashReport(content, { exitCode })
    return withReport(analysis, {
      exitCode,
      path: reportPath,
      ...(content ? { text: content.slice(0, CRASH.reportTextLimit) } : {})
    })
  } catch (error) {
    logger.debug(`Вердикт не построен: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function publish(state: GameState): void {
  lastState = state
  emitEvent('game:state', state)
  for (const listener of stateListeners) listener(state)
}

function hideSecrets(argument: string): string {
  return argument.length >= 32 && /^[A-Za-z0-9._-]+$/.test(argument) && argument.includes('.')
    ? '***'
    : argument
}
