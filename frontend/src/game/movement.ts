import type { Direction } from '../types'

export function desiredVelocity(
  axis: { x: number; y: number },
  speed: number,
): { vx: number; vy: number; dir: Direction | null } {
  const mag = Math.hypot(axis.x, axis.y)
  if (mag === 0) return { vx: 0, vy: 0, dir: null }
  const x = axis.x / mag
  const y = axis.y / mag
  const dir: Direction = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'down' : 'up'
  return { vx: x * speed, vy: y * speed, dir }
}

export function steerToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
  speed: number,
  arrive: number,
): { vx: number; vy: number; dir: Direction | null; arrived: boolean; dist: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist <= arrive) return { vx: 0, vy: 0, dir: null, arrived: true, dist }
  const dir: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'
  return { vx: (dx / dist) * speed, vy: (dy / dist) * speed, dir, arrived: false, dist }
}
