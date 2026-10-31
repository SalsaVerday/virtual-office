import { AccessToken } from 'livekit-server-sdk'
import type { ServerConfig } from './config.js'

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/
const IDENTITY_RE = /^[A-Za-z0-9:_-]{1,64}$/
const VARIANT_RE = /^v\d{2}$/

export type TokenRequest = {
  identity?: unknown
  name?: unknown
  room?: unknown
  variant?: unknown
}

export type TokenResponse = {
  token: string
  url: string
  room: string
}

export class TokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function issueToken(config: ServerConfig, body: TokenRequest): Promise<TokenResponse> {
  const identity = asString(body.identity)
  const name = asString(body.name).replace(/\s+/g, ' ')
  const room = asString(body.room) || 'office'
  const variantRaw = asString(body.variant)
  const variant = VARIANT_RE.test(variantRaw) ? variantRaw : 'v00'

  if (!IDENTITY_RE.test(identity)) {
    throw new TokenError('identity must be 1–64 characters (letters, numbers, :, _, -)', 400)
  }
  if (name.length < 1 || name.length > 24) {
    throw new TokenError('name must be 1–24 characters', 400)
  }
  if (!ROOM_RE.test(room)) {
    throw new TokenError('room must be 1–64 characters (letters, numbers, _, -)', 400)
  }

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata: JSON.stringify({ variant }),
    ttl: '6h',
  })
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  return {
    token: await token.toJwt(),
    url: config.livekitUrl,
    room,
  }
}
