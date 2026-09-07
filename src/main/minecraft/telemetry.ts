import { app } from 'electron'
import { TELEMETRY } from '@shared/constants'
import type { CrashVerdict, TelemetrySendResult } from '@shared/types'
import { request } from '../core/http'
import { findProfile } from '../db/profiles.repo'
import { modCount } from '../db/mods.repo'
import { getSettings } from '../store/settings.store'
import { logger } from '../logger'

const WINDOWS_USER = /C:\\Users\\([^\\"\s]+)/gi
const UNIX_HOME = /\/home\/([^/\s"']+)/g
const IPV4 = /\b(?!(?:127|10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\b)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g
const TOKEN_ARG = /(--?(?:accessToken|token|password)\s+[^\s"']+)/gi

/** Убирает из текста имя пользователя Windows, IP-адреса и возможные секреты. */
export function anonymizeLog(text: string): string {
  return text
    .replace(WINDOWS_USER, 'C:\\Users\\<user>')
    .replace(UNIX_HOME, '/home/<user>')
    .replace(IPV4, '<ip>')
    .replace(TOKEN_ARG, '--secret ***')
}

export interface CrashPayload {
  app: string
  code: string
  exitCode?: number
  suspects: string[]
  mcVersion?: string
  loader?: string
  modCount?: number
  javaMode?: string
  lines: string[]
  sentAt: string
}

export function buildCrashPayload(
  verdict: CrashVerdict,
  profileId: string | undefined
): CrashPayload {
  const profile = profileId ? findProfile(profileId) : null
  const rawLines = (verdict.reportText ?? '').split(/\r?\n/).slice(0, TELEMETRY.maxReportLines)

  const payload: CrashPayload = {
    app: `RayLauncher/${app.isPackaged ? app.getVersion() : 'dev'}`,
    code: verdict.code,
    suspects: verdict.suspects.map((suspect) => suspect.title).slice(0, 5),
    lines: rawLines.map((line) => anonymizeLog(line).slice(0, 300)),
    sentAt: new Date().toISOString()
  }

  if (verdict.exitCode !== undefined) payload.exitCode = verdict.exitCode
  if (profile) {
    payload.mcVersion = profile.gameVersion
    payload.loader = profile.loader.kind
    payload.javaMode = profile.java.mode
    try {
      payload.modCount = modCount(profile.id)
    } catch {
      // База может быть недоступна — отчёт всё равно отправляем.
    }
  }

  return payload
}

/** Отправка только при включённой телеметрии И указанном адресе приёма. */
export async function sendCrashReport(
  verdict: CrashVerdict | null,
  profileId: string | undefined
): Promise<TelemetrySendResult> {
  const settings = getSettings()

  if (!settings.telemetry) return { sent: false, reason: 'disabled' }
  if (settings.telemetryEndpoint.trim().length === 0) return { sent: false, reason: 'no-endpoint' }
  if (!verdict) return { sent: false, reason: 'no-verdict' }

  let endpoint: URL
  try {
    endpoint = new URL(settings.telemetryEndpoint.trim())
  } catch {
    return { sent: false, reason: 'no-endpoint' }
  }
  if (endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') {
    return { sent: false, reason: 'no-endpoint' }
  }

  const body = JSON.stringify(buildCrashPayload(verdict, profileId))
  if (Buffer.byteLength(body, 'utf8') > TELEMETRY.maxPayloadBytes) {
    return { sent: false, reason: 'failed' }
  }

  try {
    const response = await request(endpoint.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      timeoutMs: TELEMETRY.sendTimeoutMs,
      noRetry: true
    })
    if (!response.ok) {
      logger.warn(`Телеметрия: приёмник ответил ${response.status}`)
      return { sent: false, reason: 'failed' }
    }
    logger.info('Анонимный отчёт о краше отправлен')
    return { sent: true, reason: 'sent' }
  } catch (error) {
    logger.warn(`Телеметрия не отправлена: ${error instanceof Error ? error.message : String(error)}`)
    return { sent: false, reason: 'failed' }
  }
}
