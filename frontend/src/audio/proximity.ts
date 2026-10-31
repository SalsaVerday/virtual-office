import type { PresenceStatus, Zone, ZoneType } from '../types'

export const TILE = 32

/** Full volume inside this distance. */
export const FULL_RADIUS = 3 * TILE

/** Silence past this distance, unless both people are in the same meeting room. */
export const HEAR_RADIUS = 9 * TILE

/** How close you have to be to a focusing teammate before the knock prompt shows. */
export const KNOCK_RADIUS = 5 * TILE

const ZONE_RANK: Record<ZoneType, number> = {
  meeting: 0,
  lounge: 1,
  standup: 2,
  squad: 3,
}

export type HearPerson = {
  x: number
  y: number
  status: PresenceStatus
}

export type HearReason = 'proximity' | 'meeting' | 'distance' | 'private-room' | 'focus'

export type HearResult = {
  gain: number
  reason: HearReason
  /** The local player should see a knock prompt for this remote. */
  knock: boolean
}

export function zoneAt(zones: readonly Zone[], x: number, y: number): Zone | null {
  let best: Zone | null = null
  let bestArea = Infinity
  for (const zone of zones) {
    if (x < zone.x || y < zone.y || x >= zone.x + zone.width || y >= zone.y + zone.height) continue
    const area = zone.width * zone.height
    if (
      !best ||
      ZONE_RANK[zone.type] < ZONE_RANK[best.type] ||
      (zone.type === best.type && area < bestArea)
    ) {
      best = zone
      bestArea = area
    }
  }
  return best
}

/** 1 inside FULL_RADIUS, smoothstep down to 0 at HEAR_RADIUS. */
export function proximityGain(distance: number): number {
  if (distance >= HEAR_RADIUS) return 0
  if (distance <= FULL_RADIUS) return 1
  const t = (distance - FULL_RADIUS) / (HEAR_RADIUS - FULL_RADIUS)
  const smooth = t * t * (3 - 2 * t)
  return 1 - smooth
}

/**
 * Meeting rooms (zone type `meeting`) are private: people inside only hear
 * others in the same room, at full volume, even across the room.
 * Squad, lounge, and standup areas stay on the open proximity curve.
 * Focus suppresses proximity until a knock is accepted. A shared meeting
 * room still connects, because walking into that room is the explicit join.
 */
export function computeHear(
  local: HearPerson,
  remote: HearPerson,
  zones: readonly Zone[],
  knockAccepted: boolean,
): HearResult {
  const localZone = zoneAt(zones, local.x, local.y)
  const remoteZone = zoneAt(zones, remote.x, remote.y)
  const localMeeting = localZone?.type === 'meeting' ? localZone : null
  const remoteMeeting = remoteZone?.type === 'meeting' ? remoteZone : null

  if (localMeeting || remoteMeeting) {
    if (localMeeting && remoteMeeting && localMeeting.name === remoteMeeting.name) {
      return { gain: 1, reason: 'meeting', knock: false }
    }
    return { gain: 0, reason: 'private-room', knock: false }
  }

  const distance = Math.hypot(local.x - remote.x, local.y - remote.y)
  const openGain = proximityGain(distance)
  const focusBlocks = (local.status === 'focus' || remote.status === 'focus') && !knockAccepted
  if (focusBlocks) {
    const knock = remote.status === 'focus' && local.status !== 'focus' && distance <= KNOCK_RADIUS
    return { gain: 0, reason: 'focus', knock }
  }
  if (openGain <= 0) return { gain: 0, reason: 'distance', knock: false }
  return { gain: openGain, reason: 'proximity', knock: false }
}
