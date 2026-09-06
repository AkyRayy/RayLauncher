import type { LogLevel } from '@shared/types'

export interface ParsedLine {
  level: LogLevel
  text: string
  thread?: string
  logger?: string
  time?: number
}

export function normalizeLevel(raw: string): LogLevel {
  switch (raw.trim().toUpperCase()) {
    case 'FATAL':
    case 'ERROR':
    case 'SEVERE':
      return 'error'
    case 'WARN':
    case 'WARNING':
      return 'warn'
    case 'TRACE':
    case 'DEBUG':
    case 'FINE':
      return 'debug'
    default:
      return 'info'
  }
}

const PLAIN_LINE = /^\[(\d{2}:\d{2}:\d{2})]\s\[([^/\]]+)\/([A-Z]+)]:?\s?(.*)$/s
const PLAIN_LINE_LOGGER = /^\[(\d{2}:\d{2}:\d{2})]\s\[([^\]]+)]\s\[([^/\]]+)\/([A-Z]+)]:?\s?(.*)$/s

export function parsePlainLine(line: string): ParsedLine {
  const withLogger = PLAIN_LINE_LOGGER.exec(line)
  if (withLogger) {
    return {
      level: normalizeLevel(withLogger[4] ?? 'INFO'),
      thread: withLogger[3] ?? '',
      logger: withLogger[2] ?? '',
      text: withLogger[5] ?? ''
    }
  }

  const plain = PLAIN_LINE.exec(line)
  if (plain) {
    return { level: normalizeLevel(plain[3] ?? 'INFO'), thread: plain[2] ?? '', text: plain[4] ?? '' }
  }

  const level: LogLevel = /^(Exception|Caused by:|\tat |java\.lang\.|Error:)/.test(line)
    ? 'error'
    : 'info'
  return { level, text: line }
}

const EVENT_OPEN = '<log4j:Event'
const EVENT_CLOSE = '</log4j:Event>'
const ATTRIBUTE = /(\w+)="([^"]*)"/g
const MESSAGE = /<log4j:Message>(?:<!\[CDATA\[)?([\s\S]*?)(?:]]>)?<\/log4j:Message>/
const THROWABLE = /<log4j:Throwable>(?:<!\[CDATA\[)?([\s\S]*?)(?:]]>)?<\/log4j:Throwable>/

export function parseLog4jEvent(chunk: string): ParsedLine {
  const attributes: Record<string, string> = {}
  const header = chunk.slice(0, chunk.indexOf('>') + 1)
  for (const match of header.matchAll(ATTRIBUTE)) {
    const [, key, value] = match
    if (key !== undefined) attributes[key] = value ?? ''
  }

  const message = MESSAGE.exec(chunk)?.[1] ?? ''
  const throwable = THROWABLE.exec(chunk)?.[1]
  const timestamp = Number(attributes.timestamp)

  return {
    level: normalizeLevel(attributes.level ?? 'INFO'),
    text: throwable ? `${message}\n${throwable.trimEnd()}` : message,
    ...(attributes.thread ? { thread: attributes.thread } : {}),
    ...(attributes.logger ? { logger: attributes.logger } : {}),
    ...(Number.isFinite(timestamp) && timestamp > 0 ? { time: timestamp } : {})
  }
}

export interface LogParser {
  feed(chunk: string): ParsedLine[]
  flush(): ParsedLine[]
}

export function createLogParser(): LogParser {
  let buffer = ''

  const takeXml = (result: ParsedLine[]): boolean => {
    const start = buffer.indexOf(EVENT_OPEN)
    if (start === -1) return false

    const prefix = buffer.slice(0, start)
    for (const line of splitLines(prefix)) result.push(parsePlainLine(line))

    const end = buffer.indexOf(EVENT_CLOSE, start)
    if (end === -1) {
      buffer = buffer.slice(start)
      return false
    }

    result.push(parseLog4jEvent(buffer.slice(start, end + EVENT_CLOSE.length)))
    buffer = buffer.slice(end + EVENT_CLOSE.length)
    return true
  }

  return {
    feed(chunk: string): ParsedLine[] {
      buffer += chunk
      const result: ParsedLine[] = []

      while (takeXml(result)) continue

      if (!buffer.includes(EVENT_OPEN)) {
        const lastBreak = buffer.lastIndexOf('\n')
        if (lastBreak !== -1) {
          for (const line of splitLines(buffer.slice(0, lastBreak))) result.push(parsePlainLine(line))
          buffer = buffer.slice(lastBreak + 1)
        }
      }

      return result
    },

    flush(): ParsedLine[] {
      const rest = buffer.trim()
      buffer = ''
      if (rest.length === 0) return []
      return rest.startsWith(EVENT_OPEN) ? [parseLog4jEvent(rest)] : splitLines(rest).map(parsePlainLine)
    }
  }
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
}

export function looksLikeGameReady(line: ParsedLine): boolean {
  return (
    /Setting user:/i.test(line.text) ||
    /LWJGL Version:/i.test(line.text) ||
    /Created:\s+\d+x\d+/i.test(line.text) ||
    /Sound engine started/i.test(line.text) ||
    /Backend library: LWJGL/i.test(line.text)
  )
}

export function looksLikeCrash(line: ParsedLine): boolean {
  return (
    line.text.includes('---- Minecraft Crash Report ----') ||
    /A fatal error has been detected by the Java Runtime Environment/.test(line.text) ||
    /Exception in thread "main"/.test(line.text)
  )
}

export function detectFatalReason(
  line: ParsedLine
): 'JAVA_VERSION_MISMATCH' | 'GAME_CRASHED' | null {
  if (/UnsupportedClassVersionError|has been compiled by a more recent version/.test(line.text)) {
    return 'JAVA_VERSION_MISMATCH'
  }
  if (/Could not reserve enough space for .* object heap|OutOfMemoryError/.test(line.text)) {
    return 'GAME_CRASHED'
  }
  return null
}
