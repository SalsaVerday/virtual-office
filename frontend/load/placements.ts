import { HEAR_RADIUS, computeHear, zoneAt } from '../src/audio/proximity'
import { zonesFromTiled, type TiledZoneObject } from '../src/game/zones'
import type { Zone } from '../src/types'

export type ScenarioName = 'open' | 'clusters' | 'proximity'

export type Spot = {
  x: number
  y: number
  zone: string | null
}

export type Placement = {
  scenario: ScenarioName
  spots: Spot[]
  /** Minimum spacing the picker was able to keep, in pixels. */
  minSpacing: number
}

type MapLayer = {
  name?: string
  type?: string
  width?: number
  height?: number
  data?: number[]
  objects?: TiledZoneObject[]
}

export type OfficeMap = {
  width: number
  height: number
  tilewidth: number
  layers: MapLayer[]
}

type Cell = { x: number; y: number }

const CLUSTER_PLAN: Array<[string, number]> = [
  ['Meeting 1', 4],
  ['Meeting 2', 4],
  ['Squad A', 5],
  ['Squad B', 5],
  ['Squad C', 4],
  ['Squad D', 4],
  ['Squad E', 4],
]

export function zonesOf(map: OfficeMap): Zone[] {
  const layer = map.layers.find((entry) => entry.name === 'zones')
  return zonesFromTiled(layer?.objects ?? [])
}

export function placeClients(map: OfficeMap, scenario: ScenarioName, count = 30): Placement {
  const zones = zonesOf(map)
  const walkable = walkableCells(map)
  if (scenario === 'open') return placeOpen(walkable, zones, count)
  if (scenario === 'clusters') return placeClusters(walkable, zones, count)
  return placeProximity(walkable, zones, count)
}

/** How many other placed people each spot can hear. */
export function audibleCounts(spots: readonly Spot[], zones: readonly Zone[]): number[] {
  return spots.map((spot, index) => {
    let heard = 0
    for (let other = 0; other < spots.length; other += 1) {
      if (other === index) continue
      if (hears(spot, spots[other], zones)) heard += 1
    }
    return heard
  })
}

function placeOpen(walkable: Cell[], zones: Zone[], count: number): Placement {
  const candidates = walkable.filter((cell) => zoneAt(zones, cell.x, cell.y)?.type !== 'meeting')
  let best: Cell[] = []
  let bestSpacing = 0
  for (let spacing = 320; spacing >= 96; spacing -= 16) {
    const picked = spread(candidates, count, spacing)
    if (picked.length >= count) {
      best = picked.slice(0, count)
      bestSpacing = spacing
      break
    }
    if (picked.length > best.length) {
      best = picked
      bestSpacing = spacing
    }
  }
  return { scenario: 'open', minSpacing: bestSpacing, spots: best.map((cell) => spot(cell, zones)) }
}

function placeClusters(walkable: Cell[], zones: Zone[], count: number): Placement {
  const chosen: Cell[] = []
  let spacing = 48
  for (const [name, want] of CLUSTER_PLAN) {
    if (chosen.length >= count) break
    const zone = zones.find((entry) => entry.name === name)
    if (!zone) continue
    const inside = walkable.filter((cell) => zoneAt(zones, cell.x, cell.y)?.name === name)
    const take = Math.min(want, count - chosen.length)
    const cluster = clusterNearCenter(inside, zone, take)
    chosen.push(...cluster)
    if (cluster.length >= 2) {
      spacing = Math.min(spacing, minPairDistance(cluster))
    }
  }
  return { scenario: 'clusters', minSpacing: spacing, spots: chosen.map((cell) => spot(cell, zones)) }
}

function placeProximity(walkable: Cell[], zones: Zone[], count: number): Placement {
  const standup = zones.find((zone) => zone.name === 'Standup')
  const center = standup
    ? { x: standup.x + standup.width / 2, y: standup.y + standup.height / 2 }
    : { x: 768, y: 512 }
  const pool = walkable
    .filter((cell) => zoneAt(zones, cell.x, cell.y)?.type !== 'meeting')
    .filter((cell) => Math.hypot(cell.x - center.x, cell.y - center.y) <= HEAR_RADIUS)
    .sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y))
  const chosen: Cell[] = []
  for (const cell of pool) {
    const spotA = spot(cell, zones)
    const audibleToAll = chosen.every((other) => hears(spotA, spot(other, zones), zones))
    if (!audibleToAll) continue
    chosen.push(cell)
    if (chosen.length === count) break
  }
  return {
    scenario: 'proximity',
    minSpacing: minPairDistance(chosen),
    spots: chosen.map((cell) => spot(cell, zones)),
  }
}

function walkableCells(map: OfficeMap): Cell[] {
  const collision = map.layers.find((layer) => layer.name === 'collision')
  const data = collision?.data ?? []
  const tile = map.tilewidth
  const cells: Cell[] = []
  for (let ty = 1; ty < map.height - 1; ty += 1) {
    for (let tx = 1; tx < map.width - 1; tx += 1) {
      if ((data[ty * map.width + tx] ?? 0) !== 0) continue
      cells.push({ x: tx * tile + tile / 2, y: ty * tile + tile / 2 })
    }
  }
  cells.sort((a, b) => a.y - b.y || a.x - b.x)
  return cells
}

function spread(candidates: Cell[], count: number, minSpacing: number): Cell[] {
  if (candidates.length === 0) return []
  const origin = candidates[Math.floor(candidates.length / 2)]
  const chosen: Cell[] = [origin]
  while (chosen.length < count) {
    let best: Cell | null = null
    let bestDistance = -1
    for (const cell of candidates) {
      let nearest = Infinity
      for (const picked of chosen) {
        const distance = Math.hypot(cell.x - picked.x, cell.y - picked.y)
        if (distance < nearest) nearest = distance
      }
      if (nearest > bestDistance) {
        bestDistance = nearest
        best = cell
      }
    }
    if (!best || bestDistance < minSpacing) break
    chosen.push(best)
  }
  return chosen
}

function clusterNearCenter(candidates: Cell[], zone: Zone, count: number): Cell[] {
  const center = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }
  const sorted = [...candidates].sort(
    (a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y),
  )
  for (let spacing = 40; spacing >= 0; spacing -= 8) {
    const chosen: Cell[] = []
    for (const cell of sorted) {
      if (chosen.every((other) => Math.hypot(cell.x - other.x, cell.y - other.y) >= spacing)) chosen.push(cell)
      if (chosen.length === count) return chosen
    }
  }
  return sorted.slice(0, count)
}

function spot(cell: Cell, zones: readonly Zone[]): Spot {
  return { x: cell.x, y: cell.y, zone: zoneAt(zones, cell.x, cell.y)?.name ?? null }
}

function hears(a: Spot, b: Spot, zones: readonly Zone[]): boolean {
  return (
    computeHear({ x: a.x, y: a.y, status: 'online' }, { x: b.x, y: b.y, status: 'online' }, zones, false).gain > 0
  )
}

function minPairDistance(cells: Cell[]): number {
  if (cells.length < 2) return 0
  let min = Infinity
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const distance = Math.hypot(cells[i].x - cells[j].x, cells[i].y - cells[j].y)
      if (distance < min) min = distance
    }
  }
  return min
}
