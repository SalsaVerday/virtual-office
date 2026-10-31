import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { zonesFromTiled, type TiledZoneObject } from './zones'
import { zoneTarget } from './zoneLink'

type MapJson = { layers: Array<{ name: string; objects?: TiledZoneObject[] }> }

const map = JSON.parse(readFileSync(new URL('../../public/assets/maps/office.json', import.meta.url), 'utf8')) as MapJson
const zones = zonesFromTiled(map.layers.find((layer) => layer.name === 'zones')?.objects ?? [])

describe('zone deep link', () => {
  it('targets the center of the standup circle', () => {
    const target = zoneTarget('?zone=standup&entry=teams_tab', zones)
    expect(target?.name).toBe('Standup')
    expect(target).toMatchObject({ x: 768, y: 512 })
  })

  it('matches a zone name and ignores an unknown zone', () => {
    expect(zoneTarget('?zone=Meeting%201', zones)?.name).toBe('Meeting 1')
    expect(zoneTarget('?zone=roof', zones)).toBeNull()
    expect(zoneTarget('', zones)).toBeNull()
  })
})
