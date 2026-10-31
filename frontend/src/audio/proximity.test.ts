import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { zonesFromTiled, type TiledZoneObject } from '../game/zones'
import { FULL_RADIUS, HEAR_RADIUS, computeHear, proximityGain, zoneAt } from './proximity'

type MapJson = {
  width: number
  height: number
  tilewidth: number
  layers: Array<{ name: string; type: string; objects?: TiledZoneObject[]; data?: number[] }>
  tilesets: Array<{ name: string; firstgid: number; tiles?: Array<{ id: number; properties?: Array<{ name: string; value: unknown }> }> }>
}

const map = JSON.parse(
  readFileSync(new URL('../../public/assets/maps/office.json', import.meta.url), 'utf8'),
) as MapJson

const zones = zonesFromTiled(map.layers.find((layer) => layer.name === 'zones')?.objects ?? [])

describe('office map contract', () => {
  it('is the 48x30 office with the nine named zones', () => {
    expect(map.width).toBe(48)
    expect(map.height).toBe(30)
    expect(map.tilewidth).toBe(32)
    expect(map.layers.map((layer) => layer.name)).toEqual([
      'floor',
      'walls',
      'props_below',
      'props_above',
      'collision',
      'zones',
    ])
    expect(zones.map((zone) => [zone.name, zone.type])).toEqual([
      ['Squad A', 'squad'],
      ['Squad B', 'squad'],
      ['Squad C', 'squad'],
      ['Squad D', 'squad'],
      ['Squad E', 'squad'],
      ['Meeting 1', 'meeting'],
      ['Meeting 2', 'meeting'],
      ['Lounge', 'lounge'],
      ['Standup', 'standup'],
    ])
    const meeting1 = zones.find((zone) => zone.name === 'Meeting 1')
    const meeting2 = zones.find((zone) => zone.name === 'Meeting 2')
    expect(meeting1).toMatchObject({ x: 1056, y: 672, width: 192, height: 256 })
    expect(meeting2).toMatchObject({ x: 1280, y: 672, width: 224, height: 256 })
  })

  it('marks collision tile 11 as collides in the embedded tileset', () => {
    const tileset = map.tilesets.find((entry) => entry.name === 'office_floor_walls')
    const tile = tileset?.tiles?.find((entry) => entry.id === 11)
    const collides = tile?.properties?.find((property) => property.name === 'collides')
    expect(collides?.value).toBe(true)
  })
})

describe('proximity', () => {
  const online = (x: number, y: number) => ({ x, y, status: 'online' as const })

  it('is full within 3 tiles, half at the midpoint, and silent past 9 tiles', () => {
    expect(proximityGain(0)).toBe(1)
    expect(proximityGain(FULL_RADIUS)).toBe(1)
    expect(proximityGain((FULL_RADIUS + HEAR_RADIUS) / 2)).toBeCloseTo(0.5)
    expect(proximityGain(HEAR_RADIUS)).toBe(0)
    expect(proximityGain(HEAR_RADIUS + 10)).toBe(0)
  })

  it('keeps squad, lounge, and standup on the open curve', () => {
    expect(zoneAt(zones, 720, 496)?.name).toBe('Standup')
    expect(computeHear(online(720, 496), online(784, 496), zones, false).gain).toBe(1)
    expect(computeHear(online(200, 496), online(720, 496), zones, false)).toMatchObject({
      gain: 0,
      reason: 'distance',
    })
  })

  it('treats meeting rooms as private and ignores the distance cutoff inside one room', () => {
    const nearWall = computeHear(online(1232, 720), online(1296, 720), zones, false)
    expect(zoneAt(zones, 1232, 720)?.name).toBe('Meeting 1')
    expect(zoneAt(zones, 1296, 720)?.name).toBe('Meeting 2')
    expect(nearWall).toMatchObject({ gain: 0, reason: 'private-room' })

    const across = computeHear(online(1072, 688), online(1232, 912), zones, false)
    expect(across).toMatchObject({ gain: 1, reason: 'meeting' })
    expect(proximityGain(Math.hypot(1232 - 1072, 912 - 688))).toBeLessThan(0.05)

    expect(computeHear(online(1136, 720), online(720, 496), zones, false).reason).toBe('private-room')
  })

  it('blocks proximity in focus until a knock is accepted', () => {
    const focused = { x: 784, y: 496, status: 'focus' as const }
    expect(computeHear(online(720, 496), focused, zones, false)).toMatchObject({
      gain: 0,
      reason: 'focus',
      knock: true,
    })
    expect(computeHear(online(720, 496), focused, zones, true).gain).toBe(1)
    expect(computeHear(focused, online(720, 496), zones, false).knock).toBe(false)
  })
})
