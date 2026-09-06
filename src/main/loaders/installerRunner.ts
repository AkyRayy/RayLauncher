import { spawn } from 'node:child_process'
import { readdir, writeFile } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { RayError } from '@shared/errors'
import { ensureDir, pathExists } from '../core/fsx'
import { paths } from '../core/paths'
import { logger } from '../logger'

const INSTALLER_TIMEOUT_MS = 10 * 60 * 1000

export interface InstallerResult {
  versionId: string
  output: string
}

export async function ensureLauncherProfiles(): Promise<void> {
  const file = path.join(paths().games, 'launcher_profiles.json')
  if (await pathExists(file)) return

  await ensureDir(paths().games)
  await writeFile(
    file,
    JSON.stringify({ profiles: {}, settings: {}, version: 3, clientToken: '' }, null, 2),
    'utf8'
  )
  logger.debug('Создан launcher_profiles.json для установщика загрузчика')
}

export interface RunInstallerOptions {
  javaPath: string
  installerJar: string
  label: string
  onOutput?: (line: string) => void
}

export async function runClientInstaller(options: RunInstallerOptions): Promise<InstallerResult> {
  await ensureLauncherProfiles()

  const versionsBefore = await listVersionDirs()
  const output = await runJava(options)
  const versionsAfter = await listVersionDirs()

  const created = versionsAfter.filter((id) => !versionsBefore.includes(id))

  if (created.length === 0) {
    throw new RayError(
      'LOADER_NO_VERSION',
      `Установщик ${options.label} завершился, но не создал версию`,
      { tail: tail(output) }
    )
  }

  const versionId = created.sort((left, right) => right.length - left.length)[0] ?? ''
  logger.info(`Установщик ${options.label} создал версию ${versionId}`)

  return { versionId, output }
}

function runJava(options: RunInstallerOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      options.javaPath,
      ['-jar', options.installerJar, '--installClient', paths().games],
      {
        cwd: paths().games,
        windowsHide: true,
        shell: false
      }
    )

    let output = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(
        new RayError('INTERNAL', `Установщик ${options.label} не ответил за 10 минут`, {
          tail: tail(output)
        })
      )
    }, INSTALLER_TIMEOUT_MS)

    const collect = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      output += text
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length === 0) continue
        logger.debug(`[${options.label}] ${line.trim()}`)
        options.onOutput?.(line.trim())
      }
    }

    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new RayError('JAVA_MISSING', `Не удалось запустить установщик ${options.label}`, {
        cause: error.message
      }))
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve(output)
        return
      }
      reject(
        new RayError('LOADER_NO_VERSION', `Установщик ${options.label} завершился с кодом ${code}`, {
          exitCode: code,
          tail: tail(output)
        })
      )
    })
  })
}

async function listVersionDirs(): Promise<string[]> {
  const root = paths().versions
  if (!(await pathExists(root))) return []

  const entries = await readdir(root, { withFileTypes: true })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

function tail(output: string, lines = 6): string {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-lines)
    .join('\n')
}
