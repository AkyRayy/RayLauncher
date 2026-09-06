import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { BrowserWindow, shell } from 'electron'
import { z } from 'zod'
import { AUTH, DEFAULT_MS_CLIENT_ID } from '@shared/constants'
import { RayError } from '@shared/errors'
import { request } from '../core/http'
import { logger } from '../logger'
import { getMainWindow } from '../window'

export interface MicrosoftTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const tokenResponseSchema = z.object({
  token_type: z.string(),
  scope: z.string().optional(),
  expires_in: z.number(),
  access_token: z.string(),
  refresh_token: z.string().optional()
})

let activeFlow: { cancel: () => void } | null = null

export function cancelMicrosoftSignIn(): void {
  activeFlow?.cancel()
}

export function isSignInRunning(): boolean {
  return activeFlow !== null
}

/** Официальный идентификатор лаунчера Minecraft: ему разрешён только вход через login.live.com. */
export function isDefaultClientId(clientId: string): boolean {
  return clientId.trim() === DEFAULT_MS_CLIENT_ID
}

export interface PkcePair {
  verifier: string
  challenge: string
}

export function createPkcePair(): PkcePair {
  const verifier = base64Url(randomBytes(48))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export function base64Url(input: Buffer): string {
  return input.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function buildAuthorizeUrl(params: {
  clientId: string
  redirectUri: string
  challenge: string
  state: string
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    response_type: 'code',
    redirect_uri: params.redirectUri,
    response_mode: 'query',
    scope: AUTH.scope,
    state: params.state,
    code_challenge: params.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  })
  return `${AUTH.authorize}?${query.toString()}`
}

/** Страница официального входа Minecraft: открывается во встроенном окне лаунчера. */
export function buildLiveAuthorizeUrl(params: { state: string }): string {
  const query = new URLSearchParams({
    client_id: DEFAULT_MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: AUTH.liveRedirect,
    scope: AUTH.liveScope,
    state: params.state,
    prompt: 'select_account'
  })
  return `${AUTH.liveAuthorize}?${query.toString()}`
}

/** Проверяет, что навигация пришла на desktop-редирект — именно там Microsoft отдаёт код. */
export function isLiveCallback(url: string): boolean {
  return url.startsWith(AUTH.liveRedirect)
}

export function parseRedirect(
  url: string,
  expectedState: string
): { code: string } | { error: RayError } {
  const parsed = new URL(url, 'http://127.0.0.1')
  return parseMicrosoftCallback(parsed.searchParams, expectedState)
}

/** Разбирает desktop-редирект: Microsoft может положить код как в query, так и во fragment. */
export function parseLiveRedirect(
  url: string,
  expectedState: string
): { code: string } | { error: RayError } {
  const parsed = new URL(url)
  const params = new URLSearchParams(parsed.search)
  if (!params.get('code') && !params.get('error') && parsed.hash.length > 1) {
    const fragment = new URLSearchParams(parsed.hash.slice(1))
    fragment.forEach((value, key) => params.set(key, value))
  }
  return parseMicrosoftCallback(params, expectedState)
}

function parseMicrosoftCallback(
  params: URLSearchParams,
  expectedState: string
): { code: string } | { error: RayError } {
  const error = params.get('error')

  if (error) {
    const description = params.get('error_description') ?? error
    return {
      error:
        error === 'access_denied'
          ? new RayError('MS_CANCELLED', 'Вход отменён на странице Microsoft')
          : new RayError('HTTP_ERROR', description, { error })
    }
  }

  const state = params.get('state') ?? ''
  if (!safeEquals(state, expectedState)) {
    return { error: new RayError('INVALID_INPUT', 'Не совпал state: ответ пришёл не от нашего запроса') }
  }

  const code = params.get('code')
  if (!code) return { error: new RayError('HTTP_ERROR', 'Microsoft не вернул код авторизации') }

  return { code }
}

function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function signInWithMicrosoft(clientId: string): Promise<MicrosoftTokens> {
  if (activeFlow) throw new RayError('INVALID_INPUT', 'Вход уже выполняется')

  // Публичный client_id официального лаунчера зарегистрирован в Microsoft только
  // для редиректа https://login.live.com/oauth20_desktop.srf. Отправка его на
  // v2.0-эндпоинт с loopback-редиректом всегда даёт invalid_request про redirect_uri,
  // поэтому для него используется вход через login.live.com во встроенном окне.
  // Свой Azure Client ID по-прежнему идёт через PKCE + loopback.
  if (isDefaultClientId(clientId)) return signInWithLive()

  return signInWithPkce(clientId)
}

async function signInWithPkce(clientId: string): Promise<MicrosoftTokens> {
  const { verifier, challenge } = createPkcePair()
  const state = base64Url(randomBytes(16))

  const { server, port } = await listenOnFreePort()
  const redirectUri = `http://127.0.0.1:${port}/callback`

  logger.info(`Вход Microsoft: слушаю ${redirectUri}`)

  try {
    const code = await waitForCode(server, state, redirectUri, clientId, challenge)
    return await exchangeCode({ clientId, code, verifier, redirectUri })
  } finally {
    server.close()
    activeFlow = null
  }
}

async function signInWithLive(): Promise<MicrosoftTokens> {
  const WindowCtor = BrowserWindow as unknown as typeof BrowserWindow | undefined
  if (typeof WindowCtor !== 'function') {
    throw new RayError('INTERNAL', 'Окно входа недоступно в этом окружении')
  }

  const state = base64Url(randomBytes(16))
  logger.info('Вход Microsoft: открываю официальную страницу login.live.com')

  const code = await waitForLiveCode(WindowCtor, state)
  return exchangeLiveCode(code)
}

function waitForLiveCode(WindowCtor: typeof BrowserWindow, state: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const parent = getMainWindow()

    const window = new WindowCtor({
      width: 480,
      height: 720,
      minWidth: 400,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      modal: parent !== null,
      ...(parent ? { parent } : {}),
      title: 'Вход через Microsoft',
      backgroundColor: '#f2f2f7',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:ms-login'
      }
    })

    let settled = false
    const timeout = setTimeout(() => {
      finish(new RayError('MS_CANCELLED', 'Время ожидания входа истекло'))
    }, AUTH.timeoutMs)

    const finish = (error: RayError | null, code?: string): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      activeFlow = null
      window.webContents.removeListener('will-redirect', onRedirect)
      window.webContents.removeListener('did-navigate', onNavigate)
      window.removeListener('closed', onClosed)
      if (!window.isDestroyed()) window.close()
      if (error) reject(error)
      else resolve(code ?? '')
    }

    activeFlow = { cancel: () => finish(new RayError('MS_CANCELLED', 'Вход отменён')) }

    const handleUrl = (url: string): void => {
      if (!isLiveCallback(url)) return
      const result = parseLiveRedirect(url, state)
      if ('error' in result) finish(result.error)
      else finish(null, result.code)
    }

    const onRedirect = (event: { preventDefault: () => void }, url: string): void => {
      if (isLiveCallback(url)) {
        event.preventDefault()
        handleUrl(url)
      }
    }
    const onNavigate = (_event: unknown, url: string): void => handleUrl(url)
    const onClosed = (): void => finish(new RayError('MS_CANCELLED', 'Окно входа закрыто'))

    window.webContents.on('will-redirect', onRedirect)
    window.webContents.on('did-navigate', onNavigate)
    window.once('closed', onClosed)
    window.once('ready-to-show', () => window.show())

    // Убираем Electron из User-Agent: страница Microsoft стабильнее работает с обычным Chrome.
    try {
      const userAgent = window.webContents
        .getUserAgent()
        .replaceAll(/Electron\/[\d.]+ ?/g, '')
        .trim()
      window.webContents.setUserAgent(userAgent)
    } catch {
      // Не критично: вход работает и со стандартным User-Agent.
    }

    void window.loadURL(buildLiveAuthorizeUrl({ state })).catch((error: unknown) => {
      finish(
        new RayError('NET_OFFLINE', 'Не удалось открыть страницу входа Microsoft', {
          cause: error instanceof Error ? error.message : String(error)
        })
      )
    })
  })
}

function listenOnFreePort(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        server.close()
        reject(new RayError('INTERNAL', 'Не удалось открыть локальный порт для входа'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

function waitForCode(
  server: Server,
  state: string,
  redirectUri: string,
  clientId: string,
  challenge: string
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      finish(new RayError('MS_CANCELLED', 'Время ожидания входа истекло'))
    }, AUTH.timeoutMs)

    const finish = (error: RayError | null, code?: string): void => {
      clearTimeout(timeout)
      server.removeAllListeners('request')
      if (error) reject(error)
      else resolve(code ?? '')
    }

    activeFlow = { cancel: () => finish(new RayError('MS_CANCELLED', 'Вход отменён')) }

    server.on('request', (incoming: IncomingMessage, response: ServerResponse) => {
      const url = incoming.url ?? '/'
      if (!url.startsWith('/callback')) {
        response.writeHead(404).end()
        return
      }

      const result = parseRedirect(url, state)
      respondToBrowser(response, 'error' in result ? result.error.message : null)

      if ('error' in result) finish(result.error)
      else finish(null, result.code)
    })

    void shell.openExternal(buildAuthorizeUrl({ clientId, redirectUri, challenge, state }))
  })
}

function respondToBrowser(response: ServerResponse, error: string | null): void {
  const title = error ? 'Вход не завершён' : 'Готово'
  const message = error ?? 'Учётная запись Microsoft подключена. Вернитесь в RayLauncher.'

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>RayLauncher — ${title}</title>
<style>
 body{margin:0;height:100vh;display:grid;place-items:center;background:#f2f2f7;color:#1d1d1f;
      font:15px/1.4 -apple-system,'Segoe UI Variable Text','Segoe UI',system-ui,sans-serif}
 main{max-width:26rem;text-align:center}
 h1{font-size:22px;letter-spacing:-.022em;margin:0 0 .5rem}
 p{margin:0;color:#3c3c4399}
</style></head>
<body><main><h1>${title}</h1><p>${escapeHtml(message)}</p></main></body></html>`

  response.writeHead(error ? 400 : 200, { 'Content-Type': 'text/html; charset=utf-8' })
  response.end(html)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function exchangeCode(params: {
  clientId: string
  code: string
  verifier: string
  redirectUri: string
}): Promise<MicrosoftTokens> {
  return tokenRequest(AUTH.token, {
    client_id: params.clientId,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier
  })
}

async function exchangeLiveCode(code: string): Promise<MicrosoftTokens> {
  return tokenRequest(AUTH.liveToken, {
    client_id: DEFAULT_MS_CLIENT_ID,
    grant_type: 'authorization_code',
    code,
    redirect_uri: AUTH.liveRedirect,
    scope: AUTH.liveScope
  })
}

export async function refreshMicrosoftTokens(
  clientId: string,
  refreshToken: string
): Promise<MicrosoftTokens> {
  if (isDefaultClientId(clientId)) {
    return tokenRequest(AUTH.liveToken, {
      client_id: DEFAULT_MS_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: AUTH.liveRedirect,
      scope: AUTH.liveScope
    })
  }

  return tokenRequest(AUTH.token, {
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: AUTH.scope
  })
}

async function tokenRequest(url: string, form: Record<string, string>): Promise<MicrosoftTokens> {
  const response = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    noRetry: true
  })

  const raw: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const description =
      raw && typeof raw === 'object' && 'error_description' in raw
        ? String((raw as { error_description: unknown }).error_description)
        : `Microsoft ответил ${response.status}`
    throw new RayError('HTTP_ERROR', description, { status: response.status })
  }

  const parsed = tokenResponseSchema.safeParse(raw)
  if (!parsed.success) throw new RayError('INTERNAL', 'Неожиданный ответ сервера токенов Microsoft')

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? form.refresh_token ?? '',
    expiresAt: Date.now() + parsed.data.expires_in * 1000
  }
}
