import { describe, expect, it } from 'vitest'
import { findPath } from './pathfinding'

describe('findPath', () => {
  const blocked = (x: number, y: number) => x === 1 && y === 0

  it('walks around a blocked tile', () => {
    const path = findPath(blocked, { x: 0, y: 0 }, { x: 2, y: 0 }, 3, 2)
    expect(path[0]).toEqual({ x: 0, y: 1 })
    expect(path.at(-1)).toEqual({ x: 2, y: 0 })
    expect(path.some((tile) => tile.x === 1 && tile.y === 0)).toBe(false)
  })

  it('returns nothing when the goal is blocked', () => {
    expect(findPath(blocked, { x: 0, y: 0 }, { x: 1, y: 0 }, 3, 2)).toEqual([])
  })
})
