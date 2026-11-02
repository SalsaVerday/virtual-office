import { USAGE_EVENT_NAMES, type UsageEventName } from '../../src/usage/types.js'
import { ApiError } from './errors.js'

const MAX_BATCH = 20
const MAX_PROPS_CHARS = 4_096
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_FUTURE_MS = 5 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAMES = new Set<string>(USAGE_EVENT_NAMES)

export type StoredUsageEvent = {
  name: UsageEventName
  session_id: string
  props: Record<string, unknown>
  ts: string
}

/**
 * Accepts a batch and drops any client `user_id`. The caller supplies the
 * identity from the verified LiveKit token.
 */
export function parseUsageBatch(body: unknown, now = Date.now()): StoredUsageEvent[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('usage_invalid', 400)
  const events = (body as { events?: unknown }).events
  if (!Array.isArray(events) || events.length < 1) throw new ApiError('usage_invalid', 400)
  if (events.length > MAX_BATCH) throw new ApiError('usage_batch_too_large', 400)
  return events.map((event) => parseEvent(event, now))
}

function parseEvent(event: unknown, now: number): StoredUsageEvent {
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new ApiError('usage_invalid', 400)
  const record = event as { name?: unknown; session_id?: unknown; props?: unknown; ts?: unknown }
  if (typeof record.name !== 'string' || !NAMES.has(record.name)) throw new ApiError('usage_invalid', 400)
  if (typeof record.session_id !== 'string' || !UUID_RE.test(record.session_id)) throw new ApiError('usage_invalid', 400)
  if (typeof record.ts !== 'string' || !withinWindow(record.ts, now)) throw new ApiError('usage_invalid', 400)
  return {
    name: record.name as UsageEventName,
    session_id: record.session_id.toLowerCase(),
    props: propsOf(record.props),
    ts: new Date(record.ts).toISOString(),
  }
}

function withinWindow(ts: string, now: number): boolean {
  const parsed = Date.parse(ts)
  if (!Number.isFinite(parsed)) return false
  if (parsed < now - MAX_AGE_MS) return false
  if (parsed > now + MAX_FUTURE_MS) return false
  return true
}

function propsOf(value: unknown): Record<string, unknown> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError('usage_invalid', 400)
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch {
    throw new ApiError('usage_invalid', 400)
  }
  if (encoded.length > MAX_PROPS_CHARS) throw new ApiError('usage_invalid', 400)
  const parsed = JSON.parse(encoded) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new ApiError('usage_invalid', 400)
  return parsed as Record<string, unknown>
}
