import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { tokenResult } from './lib/tokenResult'

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
