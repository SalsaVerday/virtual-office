import { createHmac } from 'node:crypto'
import { AccessToken } from 'livekit-server-sdk'
import { afterEach, describe, expect, it } from 'vitest'
import { usageUserId } from '../../src/usage/devUserId.js'
import { resetUsageRateLimit, usageResult, type UsageWrite } from '../_lib/usageResult.js'

const ENV = {
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-value',
}

const SESSION = '11111111-1111-4111-8111-111111111111'
const DECOY = '22222222-2222-4222-8222-222222222222'
const NOW = Date.parse('2026-11-02T12:00:00.000Z')

function sign(payload: Record<string, unknown>, secret = ENV.LIVEKIT_API_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

async function liveToken(identity = 'dev:ada'): Promise<string> {
  const token = new AccessToken(ENV.LIVEKIT_API_KEY, ENV.LIVEKIT_API_SECRET, {
    identity,
    name: 'Ada',
    ttl: '1h',
  })
  token.addGrant({ roomJoin: true, room: 'office', canPublish: true, canSubscribe: true })
  return token.toJwt()
}

function event(extra: Record<string, unknown> = {}) {
  return {
    name: 'join_succeeded',
    session_id: SESSION,
    props: { ok: true },
    ts: new Date(NOW).toISOString(),
    user_id: DECOY,
    ...extra,
  }
}

function capture(): { write: UsageWrite; userIds: string[]; payloads: string[] } {
  const userIds: string[] = []
  const payloads: string[] = []
  const write: UsageWrite = async (_env, userId, events) => {
    userIds.push(userId)
    payloads.push(JSON.stringify(events))
  }
  return { write, userIds, payloads }
}

describe('/api/usage', () => {
  afterEach(() => {
    resetUsageRateLimit()
  })

  it('rejects a forged LiveKit token and does not write', async () => {
    const { write, userIds } = capture()
    const token = await liveToken()
    const forged = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    const result = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${forged}`,
        body: { events: [event()] },
        env: ENV,
        clientKey: 'forged',
        now: Date.now(),
      },
      write,
    )
    expect(result.status).toBe(401)
    expect(result.json).toEqual({ error: 'invalid token' })
    expect(userIds).toEqual([])
    expect(JSON.stringify(result.json)).not.toContain(ENV.LIVEKIT_API_SECRET)
  })

  it('rejects an expired token', async () => {
    const { write, userIds } = capture()
    const token = sign({
      iss: ENV.LIVEKIT_API_KEY,
      sub: 'dev:ada',
      nbf: Math.floor(NOW / 1000) - 600,
      exp: Math.floor(NOW / 1000) - 120,
    })
    const result = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: [event()] },
        env: ENV,
        clientKey: 'expired',
        now: NOW,
      },
      write,
    )
    expect(result.status).toBe(401)
    expect(result.json).toEqual({ error: 'token expired' })
    expect(userIds).toEqual([])
  })

  it('ignores a client-supplied user id and stores the token identity', async () => {
    const { write, userIds, payloads } = capture()
    const token = await liveToken('dev:ada')
    const result = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: [event()] },
        env: ENV,
        clientKey: 'identity',
        now: Date.now(),
      },
      write,
    )
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({ ok: true, accepted: 1 })
    expect(userIds).toEqual([await usageUserId('dev:ada')])
    expect(userIds[0]).not.toBe(DECOY)
    expect(payloads[0]).not.toContain(DECOY)
  })

  it('rejects an unknown event name, a huge batch, and a non-object props', async () => {
    const { write, userIds } = capture()
    const token = sign({
      iss: ENV.LIVEKIT_API_KEY,
      sub: 'dev:ada',
      nbf: Math.floor(NOW / 1000) - 10,
      exp: Math.floor(NOW / 1000) + 600,
    })
    const badName = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: [event({ name: 'drop_table' })] },
        env: ENV,
        clientKey: 'name',
        now: NOW,
      },
      write,
    )
    expect(badName.status).toBe(400)
    expect(badName.json).toEqual({ error: 'usage_invalid' })

    const tooMany = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: Array.from({ length: 21 }, () => event()) },
        env: ENV,
        clientKey: 'batch',
        now: NOW,
      },
      write,
    )
    expect(tooMany.status).toBe(400)
    expect(tooMany.json).toEqual({ error: 'usage_batch_too_large' })

    const badProps = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: [event({ props: ['nope'] })] },
        env: ENV,
        clientKey: 'props',
        now: NOW,
      },
      write,
    )
    expect(badProps.status).toBe(400)
    expect(badProps.json).toEqual({ error: 'usage_invalid' })
    expect(userIds).toEqual([])
  })

  it('returns usage_unconfigured and does not write when the service role key is missing', async () => {
    const { write, userIds } = capture()
    const token = await liveToken()
    const result = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: [event()] },
        env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: '' },
        clientKey: 'unconfigured',
        now: Date.now(),
      },
      write,
    )
    expect(result.status).toBe(503)
    expect(result.json).toEqual({ error: 'usage_unconfigured' })
    expect(userIds).toEqual([])
    expect(JSON.stringify(result.json)).not.toContain('service-role')
  })

  it('rate-limits a caller after repeated posts', async () => {
    const { write, userIds } = capture()
    const token = sign({
      iss: ENV.LIVEKIT_API_KEY,
      sub: 'dev:ada',
      nbf: Math.floor(NOW / 1000) - 10,
      exp: Math.floor(NOW / 1000) + 600,
    })
    for (let i = 0; i < 30; i += 1) {
      const ok = await usageResult(
        {
          method: 'POST',
          authorization: `Bearer ${token}`,
          body: { events: [event()] },
          env: ENV,
          clientKey: 'burst',
          now: NOW,
        },
        write,
      )
      expect(ok.status).toBe(200)
    }
    const blocked = await usageResult(
      {
        method: 'POST',
        authorization: `Bearer ${token}`,
        body: { events: [event()] },
        env: ENV,
        clientKey: 'burst',
        now: NOW,
      },
      write,
    )
    expect(blocked.status).toBe(429)
    expect(blocked.json).toEqual({ error: 'rate_limited' })
    expect(userIds).toHaveLength(30)
  })
})
