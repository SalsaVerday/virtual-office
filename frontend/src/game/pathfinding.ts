export type TilePoint = { x: number; y: number }

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * 8-direction A* over a small tile grid. Diagonal steps are rejected when
 * either adjacent cardinal tile is blocked, so avatars don't cut corners
 * through door jambs.
 */
export function findPath(
  blocked: (x: number, y: number) => boolean,
  start: TilePoint,
  goal: TilePoint,
  width: number,
  height: number,
): TilePoint[] {
  if (start.x === goal.x && start.y === goal.y) return []
  if (goal.x < 0 || goal.y < 0 || goal.x >= width || goal.y >= height) return []
  if (blocked(goal.x, goal.y)) return []

  const key = (x: number, y: number) => y * width + x
  const heuristic = (x: number, y: number) => Math.abs(x - goal.x) + Math.abs(y - goal.y)
  const open: TilePoint[] = [start]
  const openSet = new Set<number>([key(start.x, start.y)])
  const closed = new Set<number>()
  const cost = new Map<number, number>([[key(start.x, start.y), 0]])
  const parent = new Map<number, number>()

  while (open.length > 0) {
    open.sort((a, b) => {
      const fa = (cost.get(key(a.x, a.y)) ?? 0) + heuristic(a.x, a.y)
      const fb = (cost.get(key(b.x, b.y)) ?? 0) + heuristic(b.x, b.y)
      return fa - fb
    })
    const current = open.shift()!
    const currentKey = key(current.x, current.y)
    openSet.delete(currentKey)
    if (current.x === goal.x && current.y === goal.y) {
      const path: TilePoint[] = []
      let cursor: number | undefined = currentKey
      while (cursor !== undefined && cursor !== key(start.x, start.y)) {
        path.push({ x: cursor % width, y: Math.floor(cursor / width) })
        cursor = parent.get(cursor)
      }
      path.reverse()
      return path
    }
    closed.add(currentKey)
    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx
      const ny = current.y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nextKey = key(nx, ny)
      if (closed.has(nextKey) || blocked(nx, ny)) continue
      if (dx !== 0 && dy !== 0 && (blocked(current.x + dx, current.y) || blocked(current.x, current.y + dy))) {
        continue
      }
      const step = dx !== 0 && dy !== 0 ? 1.414 : 1
      const nextCost = (cost.get(currentKey) ?? 0) + step
      if (nextCost >= (cost.get(nextKey) ?? Infinity)) continue
      cost.set(nextKey, nextCost)
      parent.set(nextKey, currentKey)
      if (!openSet.has(nextKey)) {
        open.push({ x: nx, y: ny })
        openSet.add(nextKey)
      }
    }
  }
  return []
}
