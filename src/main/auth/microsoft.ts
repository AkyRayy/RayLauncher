import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { shell } from 'electron'
import { z } from 'zod'
import { AUTH } from '@shared/constants'
import { RayError } from '@shared/errors'
import { request } from '../core/http'
import { logger } from '../logger'

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

export function parseRedirect(
  url: string,
  expectedState: string
): { code: string } | { error: RayError } {
  const parsed = new URL(url, 'http://127.0.0.1')
  const error = parsed.searchParams.get('error')

  if (error) {
    const description = parsed.searchParams.get('error_description') ?? error
    return {
      error:
        error === 'access_denied'
          ? new RayError('MS_CANCELLED', 'Вход отменён на странице Microsoft')
          : new RayError('HTTP_ERROR', description, { error })
    }
  }

  const state = parsed.searchParams.get('state') ?? ''
  if (!safeEquals(state, expectedState)) {
    return { error: new RayError('INVALID_INPUT', 'Не совпал state: ответ пришёл не от нашего запроса') }
  }

  const code = parsed.searchParams.get('code')
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
  return tokenRequest({
    client_id: params.clientId,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.verifier
  })
}

export async function refreshMicrosoftTokens(
  clientId: string,
  refreshToken: string
): Promise<MicrosoftTokens> {
  return tokenRequest({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: AUTH.scope
  })
}

async function tokenRequest(form: Record<string, string>): Promise<MicrosoftTokens> {
  const response = await request(AUTH.token, {
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
