import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetDemoPasscodeLimiter } from './lib/passcode.js'
import { tokenResult } from './lib/tokenResult.js'
import { demoUserId } from '../src/usage/devUserId.js'

const DEV = {
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

function subject(token: unknown): string {
  expect(typeof token).toBe('string')
  const part = String(token).split('.')[1]
  const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { sub?: string }
  return payload.sub ?? ''
}

describe('/api/token', () => {
  it('fails closed when LiveKit env is missing and never returns a token', async () => {
    const missing = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env: {},
    })
    expect(missing.status).toBe(503)
    expect(missing.json.token).toBeUndefined()
    expect(missing.json.error).toMatch(/LIVEKIT_URL/)

    const partial = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env: { LIVEKIT_URL: 'ws://localhost:7880', LIVEKIT_API_KEY: 'devkey' },
    })
    expect(partial.status).toBe(503)
    expect(partial.json).not.toHaveProperty('token')
    expect(partial.json.error).toMatch(/LIVEKIT_API_SECRET/)
  })

  it('refuses the dev secret in production', async () => {
    const result = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env: {
        NODE_ENV: 'production',
        LIVEKIT_URL: 'wss://office.livekit.cloud',
        LIVEKIT_API_KEY: 'APIxxxxxxxx',
        LIVEKIT_API_SECRET: 'secret',
      },
    })
    expect(result.status).toBe(500)
    expect(result.json.token).toBeUndefined()
    expect(result.json.error).toMatch(/dev secret/)
  })

  it('mints a token for the local dev key pair when it is configured explicitly', async () => {
    const result = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'qa-office', variant: 'v01' },
      env: DEV,
    })
    expect(result.status).toBe(200)
    expect(result.json.url).toBe('ws://localhost:7880')
    expect(subject(result.json.token)).toBe('dev:ada')
  })

  it('derives Azure identity from the Supabase JWT, not the body', async () => {
    const secret = 'supabase-jwt-secret-supabase-jwt-secret'
    const sub = '11111111-1111-4111-8111-111111111111'
    const bearer = signJwt(
      {
        sub,
        role: 'authenticated',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 600,
        iss: 'https://example.supabase.co/auth/v1',
        email: 'ada@contoso.com',
        app_metadata: { provider: 'azure', providers: ['azure'], tenant_id: 'tenant-1' },
        user_metadata: { full_name: 'Ada Lovelace' },
      },
      secret,
    )
    const env = {
      NODE_ENV: 'production',
      VERCEL_ENV: 'production',
      LIVEKIT_URL: 'wss://office.livekit.cloud',
      LIVEKIT_API_KEY: 'APIxxxxxxxx',
      LIVEKIT_API_SECRET: 'cloud-secret-cloud-secret-cloud-secret',
      AUTH_PROVIDER: 'azure',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_SECRET: secret,
      AZURE_TENANT_ID: 'tenant-1',
      ALLOW_DEV_LOGIN: 'true',
    }
    const ok = await tokenResult({
      method: 'POST',
      authorization: `Bearer ${bearer}`,
      body: { identity: 'dev:attacker', name: 'Mallory', room: 'office' },
      env,
    })
    expect(ok.status).toBe(200)
    expect(subject(ok.json.token)).toBe(sub)

    const devOnProd = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env,
    })
    expect(devOnProd.status).toBe(401)
    expect(devOnProd.json.token).toBeUndefined()

    const wrongTenant = await tokenResult({
      method: 'POST',
      authorization: `Bearer ${bearer}`,
      body: { identity: 'ignored', name: 'Ada', room: 'office' },
      env: { ...env, AZURE_TENANT_ID: 'other-tenant' },
    })
    expect(wrongTenant.status).toBe(403)
    expect(wrongTenant.json.token).toBeUndefined()
  })

  it('allows the staging dev login only outside production', async () => {
    const preview = {
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      LIVEKIT_URL: 'wss://staging.livekit.cloud',
      LIVEKIT_API_KEY: 'APIstaging',
      LIVEKIT_API_SECRET: 'staging-secret-staging-secret-staging',
      AUTH_PROVIDER: 'azure',
      ALLOW_DEV_LOGIN: 'true',
    }
    const ok = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env: preview,
    })
    expect(ok.status).toBe(200)
    expect(subject(ok.json.token)).toBe('dev:ada')

    const blocked = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env: { ...preview, VERCEL_ENV: 'production' },
    })
    expect(blocked.status).toBe(503)
    expect(blocked.json.token).toBeUndefined()
  })
})

const CLOUD = {
  NODE_ENV: 'production',
  VERCEL_ENV: 'preview',
  LIVEKIT_URL: 'wss://demo.livekit.cloud',
  LIVEKIT_API_KEY: 'APIdemo',
  LIVEKIT_API_SECRET: 'demo-livekit-secret-demo-livekit-secret',
  AUTH_PROVIDER: 'demo',
}

const RIGHT = 'passcode-zebra-qq-991'

describe('AUTH_PROVIDER=demo', () => {
  afterEach(() => {
    resetDemoPasscodeLimiter()
    vi.restoreAllMocks()
  })

  it('fails closed when DEMO_PASSCODE is unset or empty and returns no token', async () => {
    for (const demoPasscode of [undefined, '', '   '] as const) {
      const env: NodeJS.ProcessEnv = { ...CLOUD }
      if (demoPasscode !== undefined) env.DEMO_PASSCODE = demoPasscode
      const result = await tokenResult({
        method: 'POST',
        body: { name: 'Ada', room: 'office', passcode: RIGHT },
        env,
        clientKey: `unset-${String(demoPasscode)}`,
      })
      expect(result.status).toBe(503)
      expect(result.json).toEqual({ error: 'demo_passcode_unconfigured' })
      expect(result.json.token).toBeUndefined()
      expect(JSON.stringify(result.json)).not.toContain(RIGHT)
    }
  })

  it('rejects a wrong passcode, does not log it, and does not mint a token', async () => {
    const wrong = 'wrong-passcode-zebra-qq'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const result = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:attacker', name: 'Ada', room: 'office', passcode: wrong },
      env: { ...CLOUD, DEMO_PASSCODE: RIGHT },
      clientKey: 'wrong-once',
    })
    expect(result.status).toBe(401)
    expect(result.json).toEqual({ error: 'bad_passcode' })
    expect(result.json.token).toBeUndefined()
    const dumped = JSON.stringify({
      json: result.json,
      error: errorSpy.mock.calls,
      log: logSpy.mock.calls,
      info: infoSpy.mock.calls,
    })
    expect(dumped).not.toContain(wrong)
    expect(dumped).not.toContain(RIGHT)
  })

  it('mints a token for the right passcode under the name UUIDv5, ignoring the body identity', async () => {
    const result = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:attacker', name: 'Ada', room: 'office', variant: 'v01', passcode: `  ${RIGHT}  ` },
      env: { ...CLOUD, DEMO_PASSCODE: RIGHT },
      clientKey: 'right-once',
    })
    expect(result.status).toBe(200)
    expect(result.json.token).toEqual(expect.any(String))
    expect(subject(result.json.token)).toBe(await demoUserId('Ada'))
    expect(subject(result.json.token)).not.toBe('dev:attacker')
    expect(String(result.json.token)).not.toContain(RIGHT)
    expect(JSON.stringify(result.json)).not.toContain(RIGHT)
  })

  it('rate-limits repeated wrong passcodes and still refuses the right one until the window passes', async () => {
    const env = { ...CLOUD, DEMO_PASSCODE: RIGHT }
    const clientKey = 'rate-limit'
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const miss = await tokenResult({
        method: 'POST',
        body: { name: 'Ada', room: 'office', passcode: `nope-${attempt}` },
        env,
        clientKey,
      })
      expect(miss.status).toBe(401)
      expect(miss.json.token).toBeUndefined()
    }
    const limited = await tokenResult({
      method: 'POST',
      body: { name: 'Ada', room: 'office', passcode: 'still-wrong' },
      env,
      clientKey,
    })
    expect(limited.status).toBe(429)
    expect(limited.json).toEqual({ error: 'rate_limited' })
    expect(limited.headers?.['Retry-After']).toBeTruthy()
    expect(limited.json.token).toBeUndefined()

    const during = await tokenResult({
      method: 'POST',
      body: { name: 'Ada', room: 'office', passcode: RIGHT },
      env,
      clientKey,
    })
    expect(during.status).toBe(429)
    expect(during.json.token).toBeUndefined()

    const otherCaller = await tokenResult({
      method: 'POST',
      body: { name: 'Ada', room: 'office', passcode: RIGHT },
      env,
      clientKey: 'someone-else',
    })
    expect(otherCaller.status).toBe(200)
    expect(subject(otherCaller.json.token)).toBe(await demoUserId('Ada'))
  })

  it('does not let ALLOW_DEV_LOGIN skip the passcode', async () => {
    const result = await tokenResult({
      method: 'POST',
      body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
      env: { ...CLOUD, DEMO_PASSCODE: RIGHT, ALLOW_DEV_LOGIN: 'true' },
      clientKey: 'no-dev-bypass',
    })
    expect(result.status).toBe(401)
    expect(result.json.token).toBeUndefined()
  })
})
