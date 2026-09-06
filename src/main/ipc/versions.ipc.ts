import { readdir } from 'node:fs/promises'
import { shell } from 'electron'
import type { JavaRuntimeInfo } from '@shared/types'
import { handle } from './registry'
import { getCatalog } from '../minecraft/manifest'
import { cancelInstall, installVersion } from '../minecraft/installer'
import { JAVA_MAJORS } from '../minecraft/java/runtimeManifest'
import { javaExecutable, paths } from '../core/paths'
import { pathExists } from '../core/fsx'
import {
  cancelTask,
  clearFinished,
  listTasks,
  pauseTask,
  resumeTask,
  retryTask,
  taskById
} from '../downloads/manager'
import { logger } from '../logger'

export function registerVersionsIpc(): void {
  handle('versions:list', ({ refresh }) => getCatalog(refresh === true))

  handle('java:list', async (): Promise<JavaRuntimeInfo[]> => {
    const installed = await installedComponents()

    const components = new Set([...Object.keys(JAVA_MAJORS), ...installed])

    return Promise.all(
      [...components].map(async (component) => {
        const executable = javaExecutable(component)
        const exists = await pathExists(executable)
        return {
          component,
          majorVersion: JAVA_MAJORS[component] ?? 0,
          installed: exists,
          ...(exists ? { path: executable } : {})
        }
      })
    )
  })

  handle('install:version', async ({ versionId }) => {
    const result = await installVersion(versionId)
    return { versionId: result.versionId, javaComponent: result.javaComponent }
  })

  handle('install:cancel', ({ versionId }) => {
    cancelInstall(versionId)
  })
}

export function registerDownloadsIpc(): void {
  handle('downloads:list', () => listTasks())
  handle('downloads:pause', ({ taskId }) => pauseTask(taskId))
  handle('downloads:resume', ({ taskId }) => resumeTask(taskId))
  handle('downloads:cancel', ({ taskId }) => cancelTask(taskId))
  handle('downloads:retry', ({ taskId }) => retryTask(taskId))
  handle('downloads:clearFinished', () => clearFinished())

  handle('downloads:reveal', ({ taskId }) => {
    const task = taskById(taskId)
    if (!task) return
    shell.showItemInFolder(task.dest)
  })
}

async function installedComponents(): Promise<string[]> {
  try {
    const entries = await readdir(paths().jre, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  } catch {
    logger.debug('Каталог рантаймов ещё не создан')
    return []
  }
}
