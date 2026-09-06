import type { z } from 'zod'
import { APP_USER_AGENT, NETWORK } from '@shared/constants'
import { RayError, RETRYABLE_CODES } from '@shared/errors'
import { sleep } from './fsx'
import { logger } from '../logger'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  headers?: Record<string, string>
  body?: string | Uint8Array
  timeoutMs?: number
  retries?: number
  signal?: AbortSignal
  range?: string
  noRetry?: boolean
}

export async function request(url: string, options: RequestOptions = {}): Promise<Response> {
  const attempts = options.noRetry ? 1 : (options.retries ?? NETWORK.retries)
  let lastError: RayError | null = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? NETWORK.requestTimeoutMs)
    const abortListener = (): void => controller.abort()
    options.signal?.addEventListener('abort', abortListener, { once: true })

    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: buildHeaders(options),
        body: options.body,
        signal: controller.signal,
        redirect: 'follow'
      })

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') ?? '0')
        throw new RayError('RATE_LIMIT', `Слишком много запросов: ${url}`, {
          url,
          retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : 0
        })
      }
      if (!response.ok && response.status >= 500) {
        throw new RayError('HTTP_ERROR', `Сервер ответил ${response.status}: ${url}`, {
          url,
          status: response.status
        })
      }

      return response
    } catch (error) {
      lastError = toRayError(error, url, options.signal?.aborted === true)
      const canRetry = attempt < attempts && RETRYABLE_CODES.has(lastError.code)
      if (!canRetry) break
      const backoff = NETWORK.retryBaseMs * 2 ** (attempt - 1) + Math.random() * 200
      logger.warn(`Повтор запроса ${url} (попытка ${attempt + 1}/${attempts}) через ${Math.round(backoff)} мс`)
      await sleep(backoff)
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abortListener)
    }
  }

  throw lastError ?? new RayError('INTERNAL', `Запрос не выполнен: ${url}`)
}

export async function getJson<T>(
  url: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {}
): Promise<T> {
  const response = await request(url, options)
  if (!response.ok) {
    throw new RayError('HTTP_ERROR', `Ответ ${response.status} от ${url}`, {
      url,
      status: response.status
    })
  }
  const raw: unknown = await response.json()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new RayError('INTERNAL', `Неожиданный формат ответа: ${url}`, {
      url,
      issues: parsed.error.issues.slice(0, 5)
    })
  }
  return parsed.data
}

export async function postJson<T>(
  url: string,
  payload: unknown,
  schema: z.ZodType<T>,
  options: RequestOptions = {}
): Promise<T> {
  return getJson(url, schema, {
    ...options,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(payload)
  })
}

function buildHeaders(options: RequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': APP_USER_AGENT,
    Accept: 'application/json',
    ...options.headers
  }
  if (options.range) headers.Range = options.range
  return headers
}

function toRayError(error: unknown, url: string, userAborted: boolean): RayError {
  if (error instanceof RayError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return userAborted
      ? new RayError('MS_CANCELLED', 'Запрос отменён', { url })
      : new RayError('NET_TIMEOUT', `Превышено время ожидания: ${url}`, { url })
  }
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined
  const code = cause?.code
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED') {
    return new RayError('NET_OFFLINE', 'Нет соединения с интернетом', { url, cause: code })
  }
  return new RayError('HTTP_ERROR', error instanceof Error ? error.message : String(error), { url })
}
