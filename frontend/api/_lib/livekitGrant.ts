import { createHmac, timingSafeEqual } from 'node:crypto'
import { ApiError } from './errors.js'

const SKEW_MS = 30_000

export type LiveKitGrant = {
  identity: string
}

function b64url(value: string): Buffer {
  return Buffer.from(value, 'base64url')
}

/**
 * `/api/usage` reuses the LiveKit access token `/api/token` already issued.
 * That JWT is HS256, signed with `LIVEKIT_API_SECRET`. `sub` is the identity
 * the token route chose. The browser does not get a second session secret.
 */
export function verifyLiveKitAccessToken(
  token: string,
  apiKey: string,
  apiSecret: string,
  now = Date.now(),
): LiveKitGrant {
  const parts = token.split('.')
  if (parts.length !== 3 || !apiKey || !apiSecret) throw new ApiError('invalid token', 401)
  const [headerPart, payloadPart, sigPart] = parts
  let header: { alg?: string }
  try {
    header = JSON.parse(b64url(headerPart).toString('utf8')) as { alg?: string }
  } catch {
    throw new ApiError('invalid token', 401)
  }
  if (header.alg !== 'HS256') throw new ApiError('invalid token', 401)
  const expected = createHmac('sha256', apiSecret).update(`${headerPart}.${payloadPart}`).digest()
  let actual: Buffer
  try {
    actual = b64url(sigPart)
  } catch {
    throw new ApiError('invalid token', 401)
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new ApiError('invalid token', 401)
  }
  let payload: { iss?: unknown; sub?: unknown; exp?: unknown; nbf?: unknown }
  try {
    payload = JSON.parse(b64url(payloadPart).toString('utf8')) as typeof payload
  } catch {
    throw new ApiError('invalid token', 401)
  }
  if (payload.iss !== apiKey) throw new ApiError('invalid token', 401)
  if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 128) {
    throw new ApiError('invalid token', 401)
  }
  if (typeof payload.exp !== 'number' || payload.exp * 1000 + SKEW_MS <= now) {
    throw new ApiError('token expired', 401)
  }
  if (typeof payload.nbf === 'number' && payload.nbf * 1000 - SKEW_MS > now) {
    throw new ApiError('invalid token', 401)
  }
  return { identity: payload.sub }
}
