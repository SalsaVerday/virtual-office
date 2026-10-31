/** 1x splash is 320×180. Scale 4 is the shipped @4x sheet (1280×720). */
export const SPLASH_WIDTH = 320
export const SPLASH_HEIGHT = 180

/** Cream floor with no props. Title and the Join button stay inside this rect at 1x. */
export const SAFE_AREA = { x: 8, y: 44, width: 176, height: 84 }

export function splashScale(width: number, height: number): number {
  if (width >= SPLASH_WIDTH * 4 && height >= SPLASH_HEIGHT * 4) return 4
  if (width >= SPLASH_WIDTH * 3 && height >= SPLASH_HEIGHT * 3) return 3
  if (width >= SPLASH_WIDTH * 2 && height >= SPLASH_HEIGHT * 2) return 2
  return 1
}

/** Large screens use the nearest-neighbour @4x file. Smaller scales enlarge the 1x PNG. */
export function splashImageUrl(scale: number): string {
  return scale >= 4 ? '/assets/ui/join_splash@4x.png' : '/assets/ui/join_splash.png'
}

export type PickerCell = {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type PickerSheet = {
  image: string
  width: number
  height: number
  scale: number
  cells: PickerCell[]
}

/** Sheet is drawn at 2x. Display size divides by `scale` so each source pixel stays square. */
export function pickerCellStyle(
  sheet: PickerSheet,
  cell: PickerCell,
): { width: string; height: string; backgroundSize: string; backgroundPosition: string } {
  const display = sheet.scale > 0 ? sheet.scale : 1
  return {
    width: `${cell.w / display}px`,
    height: `${cell.h / display}px`,
    backgroundSize: `${sheet.width / display}px ${sheet.height / display}px`,
    backgroundPosition: `${-cell.x / display}px ${-cell.y / display}px`,
  }
}

export function fallbackPicker(): PickerSheet {
  return {
    image: 'avatar_picker.png',
    width: 480,
    height: 560,
    scale: 2,
    cells: Array.from({ length: 30 }, (_, index) => ({
      id: `v${index.toString().padStart(2, '0')}`,
      x: (index % 6) * 80,
      y: Math.floor(index / 6) * 112,
      w: 80,
      h: 112,
    })),
  }
}

export function parsePickerSheet(value: unknown): PickerSheet | null {
  if (!value || typeof value !== 'object') return null
  const record = value as {
    image?: unknown
    width?: unknown
    height?: unknown
    scale?: unknown
    cells?: unknown
  }
  if (typeof record.image !== 'string' || !Array.isArray(record.cells)) return null
  if (typeof record.width !== 'number' || typeof record.height !== 'number') return null
  const cells: PickerCell[] = []
  for (const item of record.cells) {
    if (!item || typeof item !== 'object') return null
    const cell = item as { id?: unknown; x?: unknown; y?: unknown; w?: unknown; h?: unknown }
    if (typeof cell.id !== 'string') return null
    if (typeof cell.x !== 'number' || typeof cell.y !== 'number' || typeof cell.w !== 'number' || typeof cell.h !== 'number') {
      return null
    }
    cells.push({ id: cell.id, x: cell.x, y: cell.y, w: cell.w, h: cell.h })
  }
  if (cells.length === 0) return null
  const scale = typeof record.scale === 'number' && record.scale > 0 ? record.scale : 2
  return { image: record.image, width: record.width, height: record.height, scale, cells }
}
