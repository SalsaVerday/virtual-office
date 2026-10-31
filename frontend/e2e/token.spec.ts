import { expect, test } from '@playwright/test'
import { tokenResult } from '../api/lib/tokenResult'

test('/api/token fails closed without LiveKit env', async ({ request }) => {
  const missing = await tokenResult({
    method: 'POST',
    body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
    env: {},
  })
  expect(missing.status).toBe(503)
  expect(missing.json).not.toHaveProperty('token')

  const devSecret = await tokenResult({
    method: 'POST',
    body: { identity: 'dev:ada', name: 'Ada', room: 'office' },
    env: {
      NODE_ENV: 'production',
      LIVEKIT_URL: 'wss://office.livekit.cloud',
      LIVEKIT_API_KEY: 'APIxxxxxxxx',
      LIVEKIT_API_SECRET: 'secret',
    },
  })
  expect(devSecret.status).toBe(500)
  expect(devSecret.json.token).toBeUndefined()

  const live = await request.post('/api/token', { data: {} })
  const body = (await live.json()) as { token?: string; error?: string }
  expect(live.ok()).toBe(false)
  expect(body.token).toBeUndefined()
  expect(body.error).toBeTruthy()
})
