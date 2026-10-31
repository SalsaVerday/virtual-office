import type { LoadSnapshot, SampleWindow } from '../net/loadProbe'
import type { TransportSnapshot } from '../net/transportSample'
import type { PresenceStatus } from '../types'
import type { StatusSource, UsageEvent } from '../usage/types'

export type QaLoadSnapshot = LoadSnapshot
export type QaSampleWindow = SampleWindow
export type QaTransport = TransportSnapshot

export type SceneApi = {
  getPosition(): { x: number; y: number }
  teleport(x: number, y: number): void
  worldToScreen(x: number, y: number): { x: number; y: number }
  /** Pause or resume the Phaser loop. The load test pauses rendering while the rest of the clients join. */
  setRunning(running: boolean): void
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
export type QaKnocks = {
  targets: Array<{ identity: string; name: string }>
  incoming: Array<{ identity: string; name: string }>
  accepted: string[]
}

export type QaHooks = {
  ready: true
  userId: string
  sessionId: string
  position: { x: number; y: number }
  teleport: (x: number, y: number) => void
  zoneName: string | null
  roomName: string
  status: PresenceStatus
  statusSource: StatusSource
  participants: QaParticipant[]
  subscriptions: QaSubscription[]
  knocks: QaKnocks
  events: UsageEvent[]
  exportEvents: (format: 'json' | 'csv') => string
  /** Join timing and position counters. Live; read it again each time. */
  load: QaLoadSnapshot
  beginSample: () => void
  endSample: () => QaSampleWindow
  sampleTransport: () => Promise<QaTransport>
  /** Pause or resume the map loop. LiveKit stays connected either way. */
  setRunning: (running: boolean) => void
  worldToScreen: (x: number, y: number) => { x: number; y: number }
}
