import { formatBytes, formatMemory } from '@shared/util'
import type { InstallStage, InstallStageId } from '@shared/types'
import { RayError } from '@shared/errors'
import { emitEvent } from '../core/events'
import { ensureDir, pathExists } from '../core/fsx'
import { versionJarPath } from '../core/paths'
import { logger } from '../logger'
import { enqueueBatch, cancelBatch, type BatchProgress } from '../downloads/manager'
import type { DownloadSpec } from '../downloads/types'
import { currentRuleContext } from './rules'
import { resolveVersion, clientJarVersion } from './versionResolver'
import { javaComponentOf, type VersionJson } from './versionJson'
import { planClientJar, planLibraries, type LibraryPlan } from './libraries'
import { planAssets } from './assets'
import { planLogging } from './logging'
import { extractNatives } from './natives'
import { planJavaRuntime, javaMajorOf, type JavaRuntimePlan } from './java/runtimeManifest'
import { symlink } from 'node:fs/promises'
import { win32 as path } from 'node:path'

export interface InstallResult {
  versionId: string
  version: VersionJson
  chain: string[]
  javaComponent: string
  javaMajor: number
  javaPath: string
  classpath: string[]
  clientJar: string
  loggingArgument?: string
  nativesDir?: string
}

export interface InstallOptions {
  profileId?: string
  verify?: boolean
}

const activeBatches = new Map<string, Set<string>>()

export async function installVersion(
  versionId: string,
  options: InstallOptions = {}
): Promise<InstallResult> {
  const startedAt = Date.now()
  logger.info(`Установка версии ${versionId} начата`)

  const stageOf = makeStageEmitter(versionId, options.profileId)
  stageOf('version-json', 0, 0, 0, 'Читаю описание версии')

  const { version, chain } = await resolveVersion(versionId)
  const context = currentRuleContext(process.arch, `${process.getSystemVersion?.() ?? ''}`)

  const jarVersion = clientJarVersion(version, chain)
  const clientJar = versionJarPath(jarVersion)

  const libraryPlan: LibraryPlan = planLibraries(version, context)
  const clientSpec = planClientJar(version, clientJar)
  const loggingPlan = planLogging(version)

  stageOf('assets', 0, 0, 0, 'Читаю список ресурсов')
  const assetPlan = await planAssets(version)

  const java = javaComponentOf(version)
  stageOf('java', 0, 0, 0, `Проверяю Java ${java.majorVersion}`)
  const javaPlan = await ensureJavaPlan(java.component)

  const coreSpecs: DownloadSpec[] = [
    ...(clientSpec ? [clientSpec] : []),
    ...libraryPlan.downloads,
    ...(loggingPlan ? [loggingPlan.download] : [])
  ]
  const assetSpecs = assetPlan?.downloads ?? []
  const javaSpecs = javaPlan?.files ?? []

  const totalBytes =
    sumBytes(coreSpecs) + sumBytes(assetSpecs) + sumBytes(javaSpecs)
  let bytesBefore = 0

  await runStage({
    versionId,
    specs: coreSpecs,
    stage: 'libraries',
    totalBytes,
    bytesBefore,
    emit: stageOf,
    label: (progress) =>
      `Скачиваю библиотеки · ${progress.filesDone} из ${progress.filesTotal}`
  })
  bytesBefore += sumBytes(coreSpecs)

  await runStage({
    versionId,
    specs: assetSpecs,
    stage: 'assets',
    totalBytes,
    bytesBefore,
    emit: stageOf,
    label: (progress) => `Скачиваю ресурсы · ${progress.filesDone} из ${progress.filesTotal}`
  })
  bytesBefore += sumBytes(assetSpecs)

  if (javaPlan) {
    await runStage({
      versionId,
      specs: javaSpecs,
      stage: 'java',
      totalBytes,
      bytesBefore,
      emit: stageOf,
      label: (progress) =>
        `Ставлю Java ${javaMajorOf(java.component, java.majorVersion)} · ${formatBytes(progress.bytesDone)} из ${formatBytes(progress.bytesTotal)}`
    })
    await finalizeJavaRuntime(javaPlan)
  }
  bytesBefore += sumBytes(javaSpecs)

  let nativesDir: string | undefined
  if (options.profileId && libraryPlan.natives.length > 0) {
    stageOf('natives', bytesBefore / Math.max(1, totalBytes), bytesBefore, totalBytes, 'Распаковываю natives')
    const result = await extractNatives(options.profileId, libraryPlan.natives, options.verify === true)
    nativesDir = result.directory
  }

  stageOf('done', 1, totalBytes, totalBytes, `Версия ${versionId} готова`)
  logger.info(
    `Установка версии ${versionId} завершена за ${Math.round((Date.now() - startedAt) / 1000)} с, ` +
      `объём ${formatMemory(Math.round(totalBytes / (1024 * 1024)))}`
  )

  return {
    versionId,
    version,
    chain,
    javaComponent: java.component,
    javaMajor: javaMajorOf(java.component, java.majorVersion),
    javaPath: javaPlan?.javaPath ?? '',
    classpath: [...libraryPlan.classpath, clientJar],
    clientJar,
    ...(loggingPlan ? { loggingArgument: loggingPlan.argument } : {}),
    ...(nativesDir ? { nativesDir } : {})
  }
}

export async function ensureJavaRuntime(component: string): Promise<string> {
  const plan = await ensureJavaPlan(component)
  if (!plan) throw new RayError('JAVA_MISSING', `Рантайм ${component} недоступен`)

  if (plan.files.length > 0) {
    const handle = enqueueBatch(plan.files)
    await handle.promise
  }
  await finalizeJavaRuntime(plan)

  if (!(await pathExists(plan.javaPath))) {
    throw new RayError('JAVA_MISSING', `java.exe не найден после установки ${component}`, {
      path: plan.javaPath
    })
  }
  return plan.javaPath
}

export function cancelInstall(versionId: string): void {
  const ids = activeBatches.get(versionId)
  if (!ids) return
  for (const id of ids) cancelBatch(id)
  activeBatches.delete(versionId)
  logger.info(`Установка версии ${versionId} отменена пользователем`)
}

type StageEmitter = (
  stage: InstallStageId,
  progress: number,
  bytesDone: number,
  bytesTotal: number,
  label: string
) => void

function makeStageEmitter(versionId: string, profileId?: string): StageEmitter {
  return (stage, progress, bytesDone, bytesTotal, label) => {
    const payload: InstallStage = {
      versionId,
      ...(profileId ? { profileId } : {}),
      stage,
      progress: Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0,
      label,
      bytesDone,
      bytesTotal
    }
    emitEvent('install:stage', payload)
  }
}

async function runStage(params: {
  versionId: string
  specs: DownloadSpec[]
  stage: InstallStageId
  totalBytes: number
  bytesBefore: number
  emit: StageEmitter
  label: (progress: BatchProgress) => string
}): Promise<void> {
  const { versionId, specs, stage, totalBytes, bytesBefore, emit, label } = params
  if (specs.length === 0) return

  const handle = enqueueBatch(specs, {
    onProgress: (progress) => {
      const done = bytesBefore + progress.bytesDone
      emit(stage, totalBytes > 0 ? done / totalBytes : 0, done, totalBytes, label(progress))
    }
  })

  const ids = activeBatches.get(versionId) ?? new Set<string>()
  ids.add(handle.id)
  activeBatches.set(versionId, ids)

  try {
    await handle.promise
  } finally {
    ids.delete(handle.id)
  }
}

async function ensureJavaPlan(component: string): Promise<JavaRuntimePlan | null> {
  try {
    const plan = await planJavaRuntime(component, process.arch)
    if (plan.files.length > 0 && (await pathExists(plan.javaPath))) {
      const missing: DownloadSpec[] = []
      for (const file of plan.files) {
        if (!(await pathExists(file.dest))) missing.push(file)
      }
      return { ...plan, files: missing }
    }
    return plan
  } catch (error) {
    const rayError = RayError.from(error, 'JAVA_MISSING')
    if (rayError.code === 'NET_OFFLINE') throw rayError
    logger.warn(`Не удалось подготовить рантайм ${component}: ${rayError.message}`)
    throw rayError
  }
}

async function finalizeJavaRuntime(plan: JavaRuntimePlan): Promise<void> {
  for (const directory of plan.directories) await ensureDir(directory)

  for (const link of plan.links) {
    if (await pathExists(link.path)) continue
    try {
      await ensureDir(path.dirname(link.path))
      await symlink(link.target, link.path, 'file')
    } catch {
      logger.debug(`Ссылка ${link.path} не создана, пропускаем`)
    }
  }
}

function sumBytes(specs: DownloadSpec[]): number {
  return specs.reduce((total, spec) => total + spec.size, 0)
}
