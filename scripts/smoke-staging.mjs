/**
 * Smoke a deployed (or local) office.
 *
 *   SMOKE_BASE_URL=https://your-preview.vercel.app node scripts/smoke-staging.mjs
 *
 * Checks:
 *   1. The page HTML loads and /api/health answers.
 *   2. POST /api/token with no identity and no session does not return a token.
 *   3. POST /api/token with a dev: identity returns a token (dev mode, or staging ALLOW_DEV_LOGIN).
 *   4. Two browsers join one room and each sees the other's position.
 *   5. The page sink recorded join_succeeded.
 *   6. If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, usage_events is readable.
 *      Dev-login writes a UUIDv5 of the dev: identity. A row is required only when
 *      SMOKE_REQUIRE_REMOTE_EVENT=1 (the preview must have the Supabase anon env).
 *
 * The service role key is read from the environment and is never printed.
 */
import { chromium } from '@playwright/test'

const base = (process.env.SMOKE_BASE_URL || process.argv[2] || '').replace(/\/$/, '')
if (!base) {
  console.error('Set SMOKE_BASE_URL to the staging origin, for example https://office-git-preview.vercel.app')
  process.exit(1)
}

const room = `smoke-${Date.now().toString(36)}`
const failures = []

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`ok  ${name}`)
    return
  }
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ''}`)
  failures.push(name)
}

async function main() {
  const pageResponse = await fetch(base)
  const html = await pageResponse.text()
  check('page loads', pageResponse.ok && html.includes('id="root"'), `status ${pageResponse.status}`)

  const health = await fetch(`${base}/api/health`)
  const healthBody = await health.json().catch(() => ({}))
  check('health', health.ok && healthBody.ok === true, `status ${health.status}`)

  const closed = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const closedBody = await closed.json().catch(() => ({}))
  check(
    'token fails closed without a session',
    closed.status >= 400 && !closedBody.token,
    `status ${closed.status}`,
  )

  const opened = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: 'dev:smoke-staging',
      name: 'Smoke',
      room,
      variant: 'v00',
    }),
  })
  const openedBody = await opened.json().catch(() => ({}))
  check(
    'token works with dev login',
    opened.status === 200 && typeof openedBody.token === 'string' && openedBody.token.length > 0,
    `status ${opened.status} ${openedBody.error || ''}`,
  )

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  let sessionId = ''
  try {
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ permissions: ['microphone'] })))
    const pages = await Promise.all(contexts.map(async (context) => context.newPage()))
    await Promise.all(
      pages.map(async (page, index) => {
        const name = index === 0 ? 'Ada' : 'Grace'
        await page.goto(`${base}/?room=${encodeURIComponent(room)}`, { waitUntil: 'domcontentloaded' })
        await page.getByTestId('display-name').fill(name)
        await page.getByTestId('room-name').fill(room)
        await page.getByTestId('join').click()
        await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 45_000 })
      }),
    )
    await pages[0].evaluate(() => window.__qa?.teleport(720, 496))
    await pages[1].evaluate(() => window.__qa?.teleport(784, 496))
    await pages[1].waitForFunction(
      () => {
        const ada = window.__qa?.participants.find((person) => person.name === 'Ada')
        return ada?.x != null && Math.hypot(ada.x - 720, ada.y - 496) < 48
      },
      null,
      { timeout: 20_000 },
    )
    await pages[0].waitForFunction(
      () => {
        const grace = window.__qa?.participants.find((person) => person.name === 'Grace')
        return grace?.x != null && Math.hypot(grace.x - 784, grace.y - 496) < 48
      },
      null,
      { timeout: 20_000 },
    )
    check('two clients see each other', true)
    const events = await pages[0].evaluate(() => window.__qa?.events ?? [])
    sessionId = (await pages[0].evaluate(() => window.__qa?.sessionId ?? '')) || ''
    const joined = events.some((event) => event.name === 'join_succeeded')
    check('event recorded in the page sink', joined && sessionId.length > 0)
    await Promise.all(contexts.map(async (context) => context.close()))
  } catch (error) {
    check('two clients see each other', false, error instanceof Error ? error.message.split('\n')[0] : String(error))
  } finally {
    await browser.close()
  }

  await checkSupabase(sessionId)

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed`)
    process.exit(1)
  }
  console.log('\nsmoke passed')
}

async function checkSupabase(sessionId) {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    console.log('ok  supabase table skipped (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to poll usage_events)')
    return
  }
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/usage_events?select=name,session_id&session_id=eq.${encodeURIComponent(sessionId)}`
  const response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!response.ok) {
    check('supabase usage_events readable', false, `status ${response.status}`)
    return
  }
  const rows = await response.json().catch(() => [])
  const found = Array.isArray(rows) && rows.length > 0
  if (found) {
    check('event reached usage_events', true)
    return
  }
  const requireRemote = process.env.SMOKE_REQUIRE_REMOTE_EVENT === '1'
  if (requireRemote) {
    check(
      'event reached usage_events',
      false,
      'no row for this session. The preview needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and migration 20261031143000_dev_usage_uuid.sql.',
    )
    return
  }
  console.log('ok  usage_events readable; no row yet (preview Supabase env or the dev-usage migration may be unset)')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
