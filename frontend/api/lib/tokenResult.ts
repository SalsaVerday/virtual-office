import { loadLiveKitConfig } from './config'
import { ApiError } from './errors'
import { resolveIdentity } from './gate'
import { issueToken } from './issue'

export type TokenCall = {
  method: string
  authorization?: string
  body: unknown
  env: NodeJS.ProcessEnv
  /** Opaque per-caller key for demo passcode backoff. Not the passcode. */
  clientKey?: string
}

export type TokenResult = {
  status: number
  json: Record<string, unknown>
  headers?: Record<string, string>
}

function asRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

/**
 * Mint a LiveKit token or fail closed. Missing LiveKit env, the dev secret in
 * production, and a failed Azure session check never include a token.
 */
export async function tokenResult(call: TokenCall): Promise<TokenResult> {
  if (call.method === 'OPTIONS') return { status: 204, json: {} }
  if (call.method !== 'POST') return { status: 405, json: { error: 'method not allowed' } }
  try {
    const config = loadLiveKitConfig(call.env)
    const body = asRecord(call.body)
    const who = await resolveIdentity(call.env, call.authorization, body, call.clientKey)
    const variant = typeof body.variant === 'string' ? body.variant : ''
    const room = typeof body.room === 'string' ? body.room : ''
    const issued = await issueToken(config, {
      identity: who.identity,
      name: who.name,
      room,
      variant,
    })
    return { status: 200, json: issued }
  } catch (error) {
    if (error instanceof ApiError) {
      return { status: error.status, json: { error: error.message }, headers: error.headers }
    }
    console.error(error)
    return { status: 500, json: { error: 'token service failed' } }
  }
}
