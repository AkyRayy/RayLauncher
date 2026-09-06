import { readdir, readFile, stat } from 'node:fs/promises'
import { win32 as path } from 'node:path'
import { instanceSubdir } from '../core/paths'
import { isNotFound } from '../core/fsx'

export interface CrashReport {
  path: string
  createdAt: number
  reason: string
}

export async function findCrashReport(profileId: string, since: number): Promise<CrashReport | null> {
  const directory = instanceSubdir(profileId, 'crash-reports')

  let names: string[]
  try {
    names = await readdir(directory)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }

  let newest: { file: string; createdAt: number } | null = null
  for (const name of names) {
    if (!name.toLowerCase().endsWith('.txt')) continue
    const file = path.join(directory, name)
    const info = await stat(file)
    const createdAt = info.mtimeMs
    if (createdAt + 1000 < since) continue
    if (!newest || createdAt > newest.createdAt) newest = { file, createdAt }
  }

  if (!newest) return null

  const content = await readFile(newest.file, 'utf8').catch(() => '')
  return { path: newest.file, createdAt: newest.createdAt, reason: extractCrashReason(content) }
}

export function extractCrashReason(content: string): string {
  const description = /^Description:\s*(.+)$/m.exec(content)?.[1]?.trim()
  const exception = /^([\w.$]+(?:Exception|Error)(?::.*)?)$/m.exec(content)?.[1]?.trim()

  if (description && exception) return `${description}: ${shorten(exception)}`
  if (exception) return shorten(exception)
  if (description) return description

  const jvm = /^#\s+(SIGSEGV|EXCEPTION_ACCESS_VIOLATION|Java VM:.*)$/m.exec(content)?.[1]?.trim()
  if (jvm) return `Сбой виртуальной машины Java: ${jvm}`

  return 'Игра завершилась с ошибкой, причина в отчёте не указана'
}

function shorten(line: string): string {
  return line.length > 200 ? `${line.slice(0, 197)}…` : line
}
