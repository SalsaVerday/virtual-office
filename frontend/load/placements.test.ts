import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeHear } from '../src/audio/proximity'
import { audibleCounts, placeClients, zonesOf, type OfficeMap, type Spot } from './placements'

const map = JSON.parse(readFileSync(new URL('../public/assets/maps/office.json', import.meta.url), 'utf8')) as OfficeMap
const zones = zonesOf(map)

function gain(a: Spot, b: Spot): number {
  return computeHear({ x: a.x, y: a.y, status: 'online' }, { x: b.x, y: b.y, status: 'online' }, zones, false).gain
}

describe('load-test placements', () => {
  it('spreads 30 people across the open floor, outside meeting rooms', () => {
    const placement = placeClients(map, 'open', 30)
    expect(placement.spots).toHaveLength(30)
    expect(placement.minSpacing).toBeGreaterThanOrEqual(96)
    for (const spot of placement.spots) {
      const zone = zones.find((entry) => entry.name === spot.zone)
      expect(zone?.type === 'meeting').toBe(false)
    }
    const heard = audibleCounts(placement.spots, zones)
    const mean = heard.reduce((sum, value) => sum + value, 0) / heard.length
    expect(Math.max(...heard)).toBeLessThan(29)
    expect(mean).toBeLessThan(20)
  })

  it('splits clusters across both meeting rooms and every squad', () => {
    const placement = placeClients(map, 'clusters', 30)
    expect(placement.spots).toHaveLength(30)
    const counts = new Map<string, number>()
    for (const spot of placement.spots) counts.set(spot.zone ?? '', (counts.get(spot.zone ?? '') ?? 0) + 1)
    expect(counts.get('Meeting 1')).toBe(4)
    expect(counts.get('Meeting 2')).toBe(4)
    expect(counts.get('Squad A')).toBe(5)
    expect(counts.get('Squad C')).toBe(4)

    const meeting = placement.spots.filter((spot) => spot.zone === 'Meeting 1')
    expect(gain(meeting[0], meeting[1])).toBe(1)
    const squadA = placement.spots.find((spot) => spot.zone === 'Squad A')
    const squadC = placement.spots.find((spot) => spot.zone === 'Squad C')
    expect(squadA && squadC && gain(squadA, squadC)).toBe(0)
    expect(squadA && gain(squadA, meeting[0])).toBe(0)

    for (const name of ['Squad A', 'Squad B', 'Squad C', 'Squad D', 'Squad E', 'Meeting 1', 'Meeting 2']) {
      const group = placement.spots.filter((spot) => spot.zone === name)
      for (const person of group) {
        for (const other of group) {
          if (person === other) continue
          expect(gain(person, other)).toBeGreaterThan(0)
        }
      }
    }
  })

  it('puts 30 people inside mutual proximity range', () => {
    const placement = placeClients(map, 'proximity', 30)
    expect(placement.spots.length).toBeGreaterThanOrEqual(12)
    expect(placement.spots).toHaveLength(30)
    for (let i = 0; i < placement.spots.length; i += 1) {
      for (let j = i + 1; j < placement.spots.length; j += 1) {
        expect(gain(placement.spots[i], placement.spots[j])).toBeGreaterThan(0)
      }
    }
    const heard = audibleCounts(placement.spots, zones)
    expect(Math.min(...heard)).toBe(29)
  })
})
