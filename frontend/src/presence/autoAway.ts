import type { PresenceStatus } from '../types'
import type { StatusSource } from '../usage/types'

export const IDLE_AWAY_MS = 180_000
export const HIDDEN_AWAY_MS = 20_000

export type AwayState = {
  status: PresenceStatus
  source: StatusSource
}

export type AwayEvent = 'activity' | 'idle' | 'hidden' | 'visible'

/**
 * Focus is sticky. A manual Away stays until the person picks another status.
 * Idle and a hidden tab only move Online → Away, and activity or a visible tab
 * brings an automatic Away back to Online.
 */
export function reduceAway(state: AwayState, event: AwayEvent): AwayState {
  if (state.status === 'focus') return state
  if (event === 'idle' || event === 'hidden') {
    if (state.status !== 'online') return state
    return { status: 'away', source: 'idle' }
  }
  if (state.status === 'away' && state.source === 'idle') {
    return { status: 'online', source: 'idle' }
  }
  return state
}

export function readDuration(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1000) return fallback
  return parsed
}
