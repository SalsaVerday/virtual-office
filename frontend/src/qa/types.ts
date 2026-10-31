import type { PresenceStatus } from '../types'

export type SceneApi = {
  getPosition(): { x: number; y: number }
  teleport(x: number, y: number): void
  worldToScreen(x: number, y: number): { x: number; y: number }
}

export type QaParticipant = {
  identity: string
  name: string
  isLocal: boolean
  x: number | null
  y: number | null
  status: PresenceStatus
  variant: string
  zoneName: string | null
}

export type QaSubscription = {
  identity: string
  name: string
  trackSid: string | null
  source: string | null
  subscribed: boolean
  /** Proximity volume we commanded, 0–1. */
  gain: number
  /** Current Web Audio GainNode value, or null if no graph exists yet. */
  appliedGain: number | null
}

/**
 * Dev/staging only. Properties are live getters.
 * `roomName` is the LiveKit room. `zoneName` is the Tiled zone under your feet (null in the hallway).
 */
export type QaHooks = {
  ready: true
  userId: string
  position: { x: number; y: number }
  teleport: (x: number, y: number) => void
  zoneName: string | null
  roomName: string
  participants: QaParticipant[]
  subscriptions: QaSubscription[]
  worldToScreen: (x: number, y: number) => { x: number; y: number }
}
