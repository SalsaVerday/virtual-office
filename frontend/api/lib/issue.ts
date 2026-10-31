import { AccessToken } from 'livekit-server-sdk'
import type { LiveKitConfig } from './config'
import { ApiError } from './errors'

const ROOM_RE = /^[A-Za-z0-9_-]{1,64}$/
const IDENTITY_RE = /^[A-Za-z0-9:_-]{1,128}$/
const VARIANT_RE = /^v\d{2}$/

export type IssueInput = {
  identity: string
  name: string
  room: string
  variant: string
}

export async function issueToken(config: LiveKitConfig, input: IssueInput): Promise<{ token: string; url: string; room: string }> {
  const identity = input.identity.trim()
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 24)
  const room = input.room.trim() || 'office'
  const variant = VARIANT_RE.test(input.variant) && Number(input.variant.slice(1)) <= 29 ? input.variant : 'v00'

  if (!IDENTITY_RE.test(identity)) {
    throw new ApiError('identity must be 1–128 characters (letters, numbers, :, _, -)', 400)
  }
  if (name.length < 1) {
    throw new ApiError('name must be 1–24 characters', 400)
  }
  if (!ROOM_RE.test(room)) {
    throw new ApiError('room must be 1–64 characters (letters, numbers, _, -)', 400)
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
    canUpdateOwnMetadata: true,
  })

  return {
    token: await token.toJwt(),
    url: config.livekitUrl,
    room,
  }
}
