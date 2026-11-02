import { createHmac, timingSafeEqual } from 'node:crypto'
import { demoUserId } from '../../src/usage/devUserId.js'
import { isVercelProduction } from './config.js'
import { ApiError } from './errors.js'
import { assertDemoPasscode } from './passcode.js'

export type Identity = {
  identity: string
  name: string
}

type Body = {
  identity?: unknown
  name?: unknown
  passcode?: unknown
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function authMode(env: NodeJS.ProcessEnv): 'dev' | 'azure' | 'demo' {
  const raw = (env.AUTH_PROVIDER ?? 'dev').trim().toLowerCase()
  if (raw === 'azure' || raw === 'supabase') return 'azure'
  if (raw === 'demo') return 'demo'
  return 'dev'
}

/**
 * Staging (and local) can keep the dev name form while AUTH_PROVIDER=azure.
 * Vercel production ignores the flag. Preview is VERCEL_ENV=preview.
 */
export function devLoginAllowed(env: NodeJS.ProcessEnv): boolean {
  if (env.ALLOW_DEV_LOGIN !== 'true') return false
  return !isVercelProduction(env)
}

function b64url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

export function verifySupabaseJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new ApiError('invalid session', 401)
  const [headerPart, payloadPart, sigPart] = parts
  let header: { alg?: string }
  try {
    header = JSON.parse(b64url(headerPart).toString('utf8')) as { alg?: string }
  } catch {
    throw new ApiError('invalid session', 401)
  }
  if (header.alg !== 'HS256') throw new ApiError('unsupported session algorithm', 401)
  const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest()
  const actual = b64url(sigPart)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError('invalid session', 401)
  }
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(b64url(payloadPart).toString('utf8')) as Record<string, unknown>
  } catch {
    throw new ApiError('invalid session', 401)
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
    throw new ApiError('session expired', 401)
  }
  return payload
}

function audienceOk(aud: unknown): boolean {
  if (aud === 'authenticated') return true
  return Array.isArray(aud) && aud.includes('authenticated')
}

function claimString(bag: unknown, key: string): string {
  if (!bag || typeof bag !== 'object') return ''
  const value = (bag as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function tenantOf(payload: Record<string, unknown>): string {
  if (typeof payload.tid === 'string') return payload.tid
  return (
    claimString(payload.app_metadata, 'tenant_id') ||
    claimString(payload.user_metadata, 'tenant_id') ||
    claimString(payload, 'tenant_id')
  )
}

function isAzureProvider(payload: Record<string, unknown>): boolean {
  const provider = claimString(payload.app_metadata, 'provider')
  if (provider === 'azure') return true
  const providers = payload.app_metadata && typeof payload.app_metadata === 'object'
    ? (payload.app_metadata as Record<string, unknown>).providers
    : null
  return Array.isArray(providers) && providers.includes('azure')
}

function nameFromPayload(payload: Record<string, unknown>): string {
  const meta = payload.user_metadata
  const full = claimString(meta, 'full_name') || claimString(meta, 'name')
  const email = typeof payload.email === 'string' ? payload.email : ''
  const direct = typeof payload.name === 'string' ? payload.name : ''
  return (full || direct || email || 'Teammate').replace(/\s+/g, ' ').slice(0, 24)
}

/**
 * Dev mode trusts the client identity (local and the staging test path).
 * Demo mode checks DEMO_PASSCODE and derives a UUIDv5 from the display name.
 * Azure mode ignores identity and name from the body and reads them from a
 * verified Supabase access token. See docs/auth-plan.md.
 */
export async function resolveIdentity(
  env: NodeJS.ProcessEnv,
  authorization: string | undefined,
  body: Body,
  clientKey = 'unknown',
): Promise<Identity> {
  const mode = authMode(env)
  const bearer = authorization?.replace(/^Bearer\s+/i, '').trim()
  const bodyIdentity = asString(body.identity)
  const bodyName = asString(body.name).replace(/\s+/g, ' ')

  if (mode === 'demo') {
    assertDemoPasscode(env, body.passcode, clientKey)
    const name = bodyName.slice(0, 24)
    if (name.length < 1) throw new ApiError('name must be 1–24 characters', 400)
    return { identity: await demoUserId(name), name }
  }

  if (mode === 'dev') {
    return { identity: bodyIdentity, name: bodyName.slice(0, 24) }
  }

  if (!bearer && devLoginAllowed(env) && bodyIdentity.startsWith('dev:')) {
    return { identity: bodyIdentity, name: bodyName.slice(0, 24) }
  }

  const secret = env.SUPABASE_JWT_SECRET?.trim() ?? ''
  const tenant = env.AZURE_TENANT_ID?.trim() ?? ''
  if (!secret || !tenant) {
    throw new ApiError('SUPABASE_JWT_SECRET and AZURE_TENANT_ID are required when AUTH_PROVIDER=azure', 503)
  }
  if (!bearer) throw new ApiError('sign in required', 401)

  const payload = verifySupabaseJwt(bearer, secret)
  if (typeof payload.sub !== 'string' || payload.sub.length < 1) throw new ApiError('invalid session', 401)
  if (payload.role !== 'authenticated' || !audienceOk(payload.aud)) throw new ApiError('invalid session', 401)
  const supabaseUrl = env.SUPABASE_URL?.trim().replace(/\/$/, '')
  if (supabaseUrl && payload.iss !== `${supabaseUrl}/auth/v1`) throw new ApiError('invalid session', 401)
  if (!isAzureProvider(payload)) throw new ApiError('Microsoft sign-in required', 403)
  if (tenantOf(payload) !== tenant) throw new ApiError('wrong tenant', 403)

  return { identity: payload.sub, name: nameFromPayload(payload) }
}
