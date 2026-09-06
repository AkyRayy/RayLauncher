import { join } from 'node:path'
import log from 'electron-log/main'
import type { LogLevel, LogLine } from '@shared/types'
import { LIMITS } from '@shared/constants'

type Emitter = (line: LogLine) => void

let emit: Emitter | null = null
const recent: LogLine[] = []
const RECENT_LIMIT = 2000

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/("?(?:access_?token|refresh_?token|id_?token|identityToken|accessToken)"?\s*[:=]\s*"?)([\w.+/=-]{8,})/gi, '$1***'],
  [/("?RpsTicket"?\s*:\s*")([^"]+)/gi, '$1***'],
  [/("?(?:password|clientSecret|client_secret)"?\s*[:=]\s*"?)([^"&,\s]+)/gi, '$1***'],
  [/(x-api-key\s*[:=]\s*)([\w$./-]+)/gi, '$1***'],
  [/(authlibinjector\.yggdrasil\.prefetched=)([\w+/=]+)/gi, '$1***'],
  [/(Bearer\s+)([\w.+/=-]{8,})/gi, '$1***'],
  [/(XBL3\.0\s+x=[^;]+;)([\w.+/=-]+)/gi, '$1***'],
  [/(code=)([\w.-]{10,})/gi, '$1***'],
  [/(client_id=)([\w-]{8,})/gi, '$1***']
]

export function maskSecrets(input: string): string {
  return SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    input
  )
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function initLogger(userDataDir: string): void {
  log.initialize()
  log.transports.file.resolvePathFn = (_variables, message) => {
    const name = message?.scope === 'renderer' ? 'renderer.log' : 'main.log'
    return join(userDataDir, 'logs', name)
  }
  log.transports.file.maxSize = LIMITS.logRotationMb * 1024 * 1024
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  log.transports.console.format = '{h}:{i}:{s} [{level}] {text}'

  log.hooks.push((message) => ({
    ...message,
    data: message.data.map((item) =>
      typeof item === 'string' ? maskSecrets(item) : maskSecrets(stringify(item))
    )
  }))

  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error }) => {
      logger.error('Необработанная ошибка процесса:', error)
    }
  })
}

export function setLogEmitter(emitter: Emitter | null): void {
  emit = emitter
}

export function recentLines(limit: number): LogLine[] {
  return recent.slice(-limit)
}

function write(level: LogLevel, args: unknown[]): void {
  const text = maskSecrets(args.map(stringify).join(' '))
  log[level](text)

  const line: LogLine = { source: 'launcher', level, time: Date.now(), text }
  recent.push(line)
  if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT)
  emit?.(line)
}

export const logger = {
  debug: (...args: unknown[]): void => write('debug', args),
  info: (...args: unknown[]): void => write('info', args),
  warn: (...args: unknown[]): void => write('warn', args),
  error: (...args: unknown[]): void => write('error', args)
}

export function logFilePath(userDataDir: string): string {
  return join(userDataDir, 'logs', 'main.log')
}
