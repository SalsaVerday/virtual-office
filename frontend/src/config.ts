/** Pixels per second. About 4.5 tiles. */
export const MOVE_SPEED = 144

/** Position data messages while walking. 10 Hz keeps 30 people well under a few hundred messages/sec. */
export const POS_SEND_INTERVAL_MS = 100

/** Idle heartbeat so a late joiner still learns where everyone is standing. */
export const POS_HEARTBEAT_MS = 2000

export const DEFAULT_ROOM = 'office'

export const ROOM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export const VARIANT_PATTERN = /^v\d{2}$/

export function sanitizeRoom(input: string | null | undefined): string {
  const room = (input ?? '').trim() || DEFAULT_ROOM
  if (!ROOM_PATTERN.test(room)) {
    throw new Error('Room names use letters, numbers, dashes, and underscores (max 64).')
  }
  return room
}

export function sanitizeName(input: string): string {
  const name = input.trim().replace(/\s+/g, ' ')
  if (name.length < 1 || name.length > 24) {
    throw new Error('Enter a name (1–24 characters).')
  }
  return name
}

export function sanitizeVariant(input: string | null | undefined): string {
  const variant = (input ?? '').trim()
  if (!VARIANT_PATTERN.test(variant)) return 'v00'
  const index = Number(variant.slice(1))
  if (index < 0 || index > 29) return 'v00'
  return variant
}

export function roomFromLocation(search: string): string {
  const raw = new URLSearchParams(search).get('room')
  try {
    return sanitizeRoom(raw)
  } catch {
    return DEFAULT_ROOM
  }
}
