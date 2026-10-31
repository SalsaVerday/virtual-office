import { isDirection, isStatus, type Direction, type PresenceStatus } from '../types'

export type PosMessage = {
  v: 1
  kind: 'pos'
  x: number
  y: number
  dir: Direction
  moving: boolean
  seq: number
  status: PresenceStatus
  variant: string
}

export type SignalMessage = {
  v: 1
  kind: 'knock' | 'knock-accept'
  to: string
}

export type OfficeMessage = PosMessage | SignalMessage

export function encodeMessage(message: OfficeMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message))
}

export function parseMessage(bytes: Uint8Array): OfficeMessage | null {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.v !== 1) return null
  if (record.kind === 'pos') {
    if (typeof record.x !== 'number' || typeof record.y !== 'number') return null
    if (typeof record.seq !== 'number' || typeof record.moving !== 'boolean') return null
    if (typeof record.dir !== 'string' || !isDirection(record.dir)) return null
    if (typeof record.status !== 'string' || !isStatus(record.status)) return null
    if (typeof record.variant !== 'string') return null
    return {
      v: 1,
      kind: 'pos',
      x: record.x,
      y: record.y,
      dir: record.dir,
      moving: record.moving,
      seq: record.seq,
      status: record.status,
      variant: record.variant,
    }
  }
  if ((record.kind === 'knock' || record.kind === 'knock-accept') && typeof record.to === 'string') {
    return { v: 1, kind: record.kind, to: record.to }
  }
  return null
}
