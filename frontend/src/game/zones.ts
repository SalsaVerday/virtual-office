import { isZoneType, type Zone, type ZoneType } from '../types'

type TiledProperty = { name?: string; value?: unknown }

export type TiledZoneObject = {
  name?: string
  type?: string
  class?: string
  x?: number
  y?: number
  width?: number
  height?: number
  properties?: TiledProperty[] | Record<string, unknown>
}

function propertyName(properties: TiledZoneObject['properties']): string | undefined {
  if (!properties) return undefined
  if (Array.isArray(properties)) {
    const found = properties.find((item) => item?.name === 'name')
    return typeof found?.value === 'string' ? found.value : undefined
  }
  const value = properties.name
  return typeof value === 'string' ? value : undefined
}

export function zonesFromTiled(objects: readonly TiledZoneObject[]): Zone[] {
  const zones: Zone[] = []
  for (const object of objects) {
    const typeName = object.type || object.class || ''
    if (!isZoneType(typeName)) {
      throw new Error(`Zone "${object.name || '(unnamed)'}" has type "${typeName}", expected squad, meeting, lounge, or standup`)
    }
    const x = object.x ?? 0
    const y = object.y ?? 0
    const width = object.width ?? 0
    const height = object.height ?? 0
    if (width <= 0 || height <= 0) {
      throw new Error(`Zone "${object.name || typeName}" is missing a rectangle`)
    }
    const name = propertyName(object.properties) || object.name || typeName
    zones.push({ name, type: typeName as ZoneType, x, y, width, height })
  }
  return zones
}
