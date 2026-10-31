import type { Zone } from '../types'

/**
 * `?zone=standup` (or a zone name such as `Meeting 1`) is the Teams deep link.
 * The value is matched against the zone type, then the zone name.
 */
export function zoneTarget(search: string, zones: readonly Zone[]): { x: number; y: number; name: string } | null {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('zone')?.trim() ?? ''
  if (!raw || raw.length > 32) return null
  const query = raw.toLowerCase()
  const zone = zones.find((item) => item.type === query) ?? zones.find((item) => item.name.toLowerCase() === query)
  if (!zone) return null
  return {
    name: zone.name,
    x: zone.x + zone.width / 2,
    y: zone.y + zone.height / 2,
  }
}
