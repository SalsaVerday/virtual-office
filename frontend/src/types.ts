export type Direction = 'down' | 'left' | 'right' | 'up'

export type PresenceStatus = 'online' | 'away' | 'focus'

export type ZoneType = 'squad' | 'meeting' | 'lounge' | 'standup'

export type Zone = {
  name: string
  type: ZoneType
  x: number
  y: number
  width: number
  height: number
}

export const ZONE_TYPES: readonly ZoneType[] = ['squad', 'meeting', 'lounge', 'standup']

export function isZoneType(value: string): value is ZoneType {
  return (ZONE_TYPES as readonly string[]).includes(value)
}

export function isStatus(value: string): value is PresenceStatus {
  return value === 'online' || value === 'away' || value === 'focus'
}

export function isDirection(value: string): value is Direction {
  return value === 'down' || value === 'left' || value === 'right' || value === 'up'
}
