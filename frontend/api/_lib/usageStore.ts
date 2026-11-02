import { createClient } from '@supabase/supabase-js'
import { ApiError } from './errors.js'
import type { StoredUsageEvent } from './usageBatch.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RowError = { message?: string } | null

/** Update `display_name` when the same person joins again with a new name. */
export const USER_UPSERT = { onConflict: 'id' } as const

export function userRecord(id: string, displayName: string): { id: string; display_name: string } {
  return { id, display_name: displayName }
}

/**
 * Service-role writes. The key stays in this process. `id` and `display_name`
 * come from the verified LiveKit token, never from the body.
 */
export async function writeUsage(
  env: NodeJS.ProcessEnv,
  user: { id: string; displayName: string },
  events: StoredUsageEvent[],
): Promise<void> {
  const url = env.SUPABASE_URL?.trim() ?? ''
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  if (!url || !key || !UUID_RE.test(user.id)) throw new ApiError('usage_unconfigured', 503)
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const userResult = await supabase.from('users').upsert(userRecord(user.id, user.displayName), USER_UPSERT)
  fail(key, userResult.error)

  const sessions = new Map<string, { started_at: string; client: string | null }>()
  for (const event of events) {
    const client = event.name === 'session_started' && typeof event.props.browser === 'string' ? event.props.browser.slice(0, 64) : null
    const existing = sessions.get(event.session_id)
    if (!existing) {
      sessions.set(event.session_id, { started_at: event.ts, client })
      continue
    }
    if (event.name === 'session_started') {
      existing.started_at = event.ts
      if (client) existing.client = client
    }
  }
  const sessionRows = [...sessions.entries()].map(([id, row]) => ({
    id,
    user_id: user.id,
    started_at: row.started_at,
    client: row.client,
  }))
  const sessionResult = await supabase.from('sessions').upsert(sessionRows, { onConflict: 'id', ignoreDuplicates: true })
  fail(key, sessionResult.error)

  const eventResult = await supabase.from('usage_events').insert(
    events.map((event) => ({
      user_id: user.id,
      session_id: event.session_id,
      name: event.name,
      props: event.props,
      ts: event.ts,
    })),
  )
  fail(key, eventResult.error)

  for (const event of events) {
    if (event.name !== 'session_ended') continue
    const ended = await supabase.from('sessions').update({ ended_at: event.ts }).eq('id', event.session_id).eq('user_id', user.id)
    fail(key, ended.error)
  }
}

function fail(key: string, error: RowError): void {
  if (!error) return
  const message = error.message ?? ''
  console.error(key && message.includes(key) ? 'usage write failed' : `usage write failed: ${message}`)
  throw new ApiError('usage_write_failed', 502)
}
