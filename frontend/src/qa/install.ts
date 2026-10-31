import type { OfficeSession } from '../net/session'
import { qaHooksEnabled } from './enable'
import type { QaHooks, SceneApi } from './types'

declare global {
  interface Window {
    __qa?: QaHooks
  }
}

export function installQaHooks(session: OfficeSession, scene: SceneApi): void {
  if (!qaHooksEnabled()) return
  const api: QaHooks = {
    ready: true,
    get userId() {
      return session.userId
    },
    get position() {
      return scene.getPosition()
    },
    teleport(x: number, y: number) {
      scene.teleport(x, y)
    },
    get zoneName() {
      return session.zoneName
    },
    get roomName() {
      return session.roomName
    },
    get sessionId() {
      return session.sessionId
    },
    get status() {
      return session.status
    },
    get statusSource() {
      return session.statusSource
    },
    get participants() {
      return session.qaParticipants()
    },
    get subscriptions() {
      return session.qaSubscriptions()
    },
    get knocks() {
      return session.qaKnocks()
    },
    get events() {
      return session.qaEvents()
    },
    exportEvents(format: 'json' | 'csv') {
      return session.exportEvents(format)
    },
    worldToScreen(x: number, y: number) {
      return scene.worldToScreen(x, y)
    },
  }
  window.__qa = api
}

export function removeQaHooks(): void {
  if (typeof window === 'undefined') return
  delete window.__qa
}
