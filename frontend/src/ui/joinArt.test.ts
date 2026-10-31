import { describe, expect, it } from 'vitest'
import { fallbackPicker, parsePickerSheet, pickerCellStyle, splashImageUrl, splashScale } from './joinArt'

describe('join splash scale', () => {
  it('uses the 4x sheet only when the viewport can hold it', () => {
    expect(splashScale(1280, 720)).toBe(4)
    expect(splashImageUrl(4)).toBe('/assets/ui/join_splash@4x.png')
    expect(splashScale(1279, 800)).toBe(3)
    expect(splashScale(960, 540)).toBe(3)
    expect(splashScale(640, 360)).toBe(2)
    expect(splashScale(500, 400)).toBe(1)
    expect(splashImageUrl(2)).toBe('/assets/ui/join_splash.png')
    expect(splashImageUrl(1)).toBe('/assets/ui/join_splash.png')
  })
})

describe('avatar picker cells', () => {
  it('maps a sheet cell onto CSS pixels at the sheet scale', () => {
    const sheet = fallbackPicker()
    expect(pickerCellStyle(sheet, sheet.cells[0])).toEqual({
      width: '40px',
      height: '56px',
      backgroundSize: '240px 280px',
      backgroundPosition: '0px 0px',
    })
    expect(pickerCellStyle(sheet, sheet.cells[7]).backgroundPosition).toBe('-40px -56px')
  })

  it('rejects a sheet that is missing cell rects', () => {
    expect(parsePickerSheet({ image: 'avatar_picker.png', width: 1, height: 1, cells: [] })).toBeNull()
    expect(parsePickerSheet(null)).toBeNull()
    const parsed = parsePickerSheet({
      image: 'avatar_picker.png',
      width: 480,
      height: 560,
      scale: 2,
      cells: [{ id: 'v00', x: 0, y: 0, w: 80, h: 112 }],
    })
    expect(parsed?.cells[0].id).toBe('v00')
  })
})
