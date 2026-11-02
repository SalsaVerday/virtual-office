import { usageUserId } from '../../src/usage/devUserId.js'
import { ApiError } from './errors.js'
import { verifyLiveKitAccessToken } from './livekitGrant.js'
import { parseUsageBatch, type StoredUsageEvent } from './usageBatch.js'
import { writeUsage } from './usageStore.js'

const WINDOW_MS = 60_000
const MAX_POSTS = 30

const buckets = new Map<string, number[]>()

export type UsageCall = {
  method: string
  authorization?: string
  body: unknown
  env: NodeJS.ProcessEnv
  /** Opaque caller key for the per-instance rate limit. Not a user id. */
  clientKey?: string
  now?: number
}

export type UsageUser = {
  id: string
  displayName: string
}

export type UsageWrite = (env: NodeJS.ProcessEnv, user: UsageUser, events: StoredUsageEvent[]) => Promise<void>

export type UsageResponse = {
  status: number
  json: Record<string, unknown>
  headers?: Record<string, string>
}

export function usageConfigured(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}

export function resetUsageRateLimit(): void {
  buckets.clear()
}

function allow(key: string, now: number): boolean {
  const recent = (buckets.get(key) ?? []).filter((at) => now - at < WINDOW_MS)
  if (recent.length >= MAX_POSTS) {
    buckets.set(key, recent)
    return false
  }
  recent.push(now)
  buckets.set(key, recent)
  return true
}

/**
 * Persist a batch for the identity inside the LiveKit access token.
 * `user_id` and any display name on the body are never read. The name is the
 * token's `name` claim.
 */
export async function usageResult(call: UsageCall, write: UsageWrite = writeUsage): Promise<UsageResponse> {
  if (call.method === 'OPTIONS') return { status: 204, json: {} }
  if (call.method !== 'POST') return { status: 405, json: { error: 'method not allowed' } }
  const now = call.now ?? Date.now()
  try {
    if (!usageConfigured(call.env) || !call.env.LIVEKIT_API_KEY?.trim() || !call.env.LIVEKIT_API_SECRET?.trim()) {
      throw new ApiError('usage_unconfigured', 503)
    }
    const clientKey = call.clientKey?.trim() || 'unknown'
    if (!allow(clientKey, now)) {
      throw new ApiError('rate_limited', 429, { 'Retry-After': '60' })
    }
    const bearer = call.authorization?.replace(/^Bearer\s+/i, '').trim() ?? ''
    if (!bearer) throw new ApiError('invalid token', 401)
    const grant = verifyLiveKitAccessToken(bearer, call.env.LIVEKIT_API_KEY.trim(), call.env.LIVEKIT_API_SECRET.trim(), now)
    const events = parseUsageBatch(call.body, now)
    const userId = await usageUserId(grant.identity)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      throw new ApiError('usage_invalid', 400)
    }
    await write(call.env, { id: userId, displayName: grant.name }, events)
    return { status: 200, json: { ok: true, accepted: events.length } }
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: error.status, json: { error: error.message }, headers: error.headers }
    }
    console.error('usage service failed')
    return { status: 500, json: { error: 'usage service failed' } }
  }
}
