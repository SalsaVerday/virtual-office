import {
  ConnectionState,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type Track as SdkTrack,
} from 'livekit-client'
import { computeHear, zoneAt } from '../audio/proximity'
import { ProximityMixer } from '../audio/mixer'
import { POS_HEARTBEAT_MS, POS_SEND_INTERVAL_MS, sanitizeRoom, sanitizeVariant } from '../config'
import { HIDDEN_AWAY_MS, IDLE_AWAY_MS, readDuration, reduceAway, type AwayEvent } from '../presence/autoAway'
import type { QaParticipant, QaSubscription } from '../qa/types'
import type { Direction, PresenceStatus, Zone } from '../types'
import type { SessionUser } from '../auth/types'
import { browserLabel, entryFromSearch } from '../usage/browser'
import { ConversationTracker } from '../usage/conversation'
import { createEventSink } from '../usage/createSink'
import { qualityFromStats, type StatRecord } from '../usage/quality'
import type { StatusSource, UsageEventName, UsageSink } from '../usage/types'
import { encodeMessage, parseMessage, type PosMessage } from './protocol'

export type LocalPose = {
  x: number
  y: number
  dir: Direction
  moving: boolean
  status: PresenceStatus
  variant: string
}

export type RemotePose = {
  identity: string
  name: string
  variant: string
  x: number
  y: number
  dir: Direction
  moving: boolean
  status: PresenceStatus
  seq: number
  talking: boolean
  knockUntil: number
}

export type OfficeUi = {
  roomName: string
  zoneName: string | null
  status: PresenceStatus
  micEnabled: boolean
  displayName: string
  peers: Array<{
    identity: string
    name: string
    status: PresenceStatus
    gain: number
    zoneName: string | null
    talking: boolean
    subscribed: boolean
  }>
  knockTargets: Array<{ identity: string; name: string }>
  incomingKnocks: Array<{ identity: string; name: string }>
  warning: string | null
}

type SentPose = {
  x: number
  y: number
  dir: Direction
  moving: boolean
  status: PresenceStatus
  variant: string
}

const QUALITY_INTERVAL_MS = 30_000

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function variantFromMetadata(metadata: string | undefined): string {
  if (!metadata) return 'v00'
  try {
    const parsed = JSON.parse(metadata) as { variant?: string }
    return sanitizeVariant(parsed.variant)
  } catch {
    return 'v00'
  }
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  if (/token|LIVEKIT_|sign in|session|tenant/i.test(message)) return 'token'
  if (/timeout/i.test(message)) return 'timeout'
  return 'connect'
}

export class OfficeSession {
  readonly userId: string
  readonly displayName: string
  readonly variant: string
  readonly sessionId: string
  readonly accessToken: string | null
  roomName = ''
  status: PresenceStatus = 'online'
  statusSource: StatusSource = 'manual'
  zoneName: string | null = null
  private room: Room | null = null
  private readonly mixer: ProximityMixer
  private zones: Zone[] = []
  private zone: Zone | null = null
  private readonly poses = new Map<string, RemotePose>()
  private readonly attributeStatus = new Map<string, PresenceStatus>()
  private readonly accepted = new Set<string>()
  private readonly gains = new Map<string, number>()
  private incoming: Array<{ identity: string; name: string }> = []
  private knockTargets: Array<{ identity: string; name: string }> = []
  private micEnabled = true
  private warning: string | null = null
  private localPose: LocalPose | null = null
  private lastSent: SentPose | null = null
  private lastSentAt = 0
  private seq = 0
  private ui: OfficeUi
  private readonly listeners = new Set<() => void>()
  private closed = false
  private ended = false
  private connectedAt = 0
  private readonly conversations: ConversationTracker
  private readonly idleMs: number
  private readonly hiddenMs: number
  private lastActivity = 0
  private hiddenAt: number | null = null
  private presenceAbort: AbortController | null = null
  private awayTimer: ReturnType<typeof setInterval> | null = null
  private qualityTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    user: SessionUser,
    audio: AudioContext,
    private readonly usage: UsageSink = createEventSink(),
  ) {
    this.userId = user.userId
    this.displayName = user.displayName
    this.variant = sanitizeVariant(user.variant)
    this.sessionId = crypto.randomUUID()
    this.accessToken = user.accessToken ?? null
    this.mixer = new ProximityMixer(audio)
    this.conversations = new ConversationTracker(this.userId)
    this.idleMs = readDuration(import.meta.env.VITE_IDLE_MS, IDLE_AWAY_MS)
    this.hiddenMs = readDuration(import.meta.env.VITE_HIDDEN_MS, HIDDEN_AWAY_MS)
    this.ui = this.snapshot()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getUi = (): OfficeUi => this.ui

  get localTalking(): boolean {
    return this.room?.localParticipant.isSpeaking ?? false
  }

  get hasIncomingKnock(): boolean {
    return this.incoming.length > 0
  }

  getPoses(): RemotePose[] {
    return [...this.poses.values()]
  }

  async connect(roomName: string): Promise<void> {
    this.roomName = sanitizeRoom(roomName)
    this.connectedAt = Date.now()
    const search = typeof window === 'undefined' ? '' : window.location.search
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
    this.emitUsage('session_started', {
      user_id: this.userId,
      session_id: this.sessionId,
      browser: browserLabel(ua),
      entry: entryFromSearch(search),
    })
    const started = performance.now()
    this.emitUsage('join_attempted', { session_id: this.sessionId, ms_to_connect: 0, error_code: null })
    try {
      await this.mixer.resume()
      const { token, url } = await this.fetchToken()
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      this.room = room
      room.on(RoomEvent.DataReceived, this.onData)
      room.on(RoomEvent.TrackSubscribed, this.onTrackSubscribed)
      room.on(RoomEvent.TrackUnsubscribed, this.onTrackUnsubscribed)
      room.on(RoomEvent.ParticipantConnected, this.onParticipantConnected)
      room.on(RoomEvent.ParticipantDisconnected, this.onParticipantDisconnected)
      room.on(RoomEvent.ParticipantAttributesChanged, this.onAttributes)
      room.on(RoomEvent.Disconnected, this.onDisconnected)
      await room.connect(url, token, { autoSubscribe: true, peerConnectionTimeout: 20_000 })
      try {
        await room.localParticipant.setMicrophoneEnabled(true)
        this.micEnabled = true
      } catch (error) {
        this.micEnabled = false
        this.warning = error instanceof Error ? error.message : 'Microphone unavailable'
      }
      try {
        await room.startAudio()
      } catch {
        this.warning = this.warning ?? 'Browser blocked audio playback. Click the office once.'
      }
      await this.mixer.resume()
      await this.publishAttributes()
      this.watchPresence()
      this.qualityTimer = setInterval(() => {
        void this.sampleQuality()
      }, QUALITY_INTERVAL_MS)
      this.emitUsage('join_succeeded', {
        session_id: this.sessionId,
        ms_to_connect: Math.round(performance.now() - started),
        error_code: null,
      })
      this.emit(true)
    } catch (error) {
      this.emitUsage('join_failed', {
        session_id: this.sessionId,
        ms_to_connect: Math.round(performance.now() - started),
        error_code: errorCode(error),
      })
      this.endSession('error')
      this.room?.removeAllListeners()
      await this.room?.disconnect().catch(() => undefined)
      this.room = null
      throw error
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.endSession('close')
    this.room?.removeAllListeners()
    await this.room?.disconnect()
    this.room = null
    this.mixer.close()
  }

  setZones(zones: Zone[]): void {
    this.zones = zones
    if (this.localPose) this.updateFrame(this.localPose)
  }

  setStatus(status: PresenceStatus, source: StatusSource = 'manual'): void {
    if (this.status === status) return
    const from = this.status
    this.status = status
    this.statusSource = source
    this.emitUsage('status_changed', { from, to: status, source })
    void this.publishAttributes()
    if (this.localPose) this.updateFrame({ ...this.localPose, status })
    else this.emit(true)
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    if (!this.room) return
    await this.room.localParticipant.setMicrophoneEnabled(enabled)
    this.micEnabled = enabled
    this.emit(true)
  }

  knock(identity: string): void {
    this.publish({ v: 1, kind: 'knock', to: identity }, true)
    this.emitUsage('knock_sent', { target_user_id: identity, accepted: false })
  }

  acceptKnock(identity: string): void {
    this.accepted.add(identity)
    this.incoming = this.incoming.filter((knock) => knock.identity !== identity)
    this.publish({ v: 1, kind: 'knock-accept', to: identity }, true)
    this.emitUsage('knock_answered', { target_user_id: identity, accepted: true })
    if (this.localPose) this.recompute(this.localPose)
    this.emit(true)
  }

  ignoreKnock(identity: string): void {
    this.incoming = this.incoming.filter((knock) => knock.identity !== identity)
    this.emitUsage('knock_answered', { target_user_id: identity, accepted: false })
    this.emit(true)
  }

  updateFrame(pose: LocalPose): void {
    this.localPose = pose
    this.recompute(pose)
    this.maybeSend(pose)
    this.emit(false)
  }

  qaParticipants(): QaParticipant[] {
    const list: QaParticipant[] = []
    if (this.localPose) {
      list.push({
        identity: this.userId,
        name: this.displayName,
        isLocal: true,
        x: this.localPose.x,
        y: this.localPose.y,
        status: this.status,
        variant: this.variant,
        zoneName: this.zoneName,
      })
    }
    const remotes = this.room ? [...this.room.remoteParticipants.values()] : []
    for (const participant of remotes) {
      const pose = this.poses.get(participant.identity)
      list.push({
        identity: participant.identity,
        name: participant.name || pose?.name || 'Someone',
        isLocal: false,
        x: pose?.x ?? null,
        y: pose?.y ?? null,
        status: pose?.status ?? this.attributeStatus.get(participant.identity) ?? 'online',
        variant: pose?.variant ?? variantFromMetadata(participant.metadata),
        zoneName: pose ? (zoneAt(this.zones, pose.x, pose.y)?.name ?? null) : null,
      })
    }
    return list
  }

  qaSubscriptions(): QaSubscription[] {
    if (!this.room) return []
    const list: QaSubscription[] = []
    for (const participant of this.room.remoteParticipants.values()) {
      const pubs = [...participant.audioTrackPublications.values()]
      if (pubs.length === 0) {
        list.push(this.subscriptionRow(participant, null))
        continue
      }
      for (const pub of pubs) list.push(this.subscriptionRow(participant, pub))
    }
    return list
  }

  qaKnocks(): {
    targets: Array<{ identity: string; name: string }>
    incoming: Array<{ identity: string; name: string }>
    accepted: string[]
  } {
    return {
      targets: this.knockTargets.map((knock) => ({ ...knock })),
      incoming: this.incoming.map((knock) => ({ ...knock })),
      accepted: [...this.accepted],
    }
  }

  qaEvents() {
    return this.usage.list()
  }

  exportEvents(format: 'json' | 'csv'): string {
    return format === 'csv' ? this.usage.exportCsv() : this.usage.exportJson()
  }

  private subscriptionRow(participant: RemoteParticipant, pub: RemoteTrackPublication | null): QaSubscription {
    const commanded = this.gains.get(participant.identity) ?? 0
    return {
      identity: participant.identity,
      name: participant.name || this.poses.get(participant.identity)?.name || 'Someone',
      trackSid: pub?.trackSid ?? null,
      source: pub?.source ?? null,
      subscribed: pub?.isSubscribed ?? false,
      gain: commanded,
      appliedGain: this.mixer.appliedGain(participant.identity),
    }
  }

  private async fetchToken(): Promise<{ token: string; url: string }> {
    const endpoint = import.meta.env.VITE_TOKEN_URL || '/api/token'
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        identity: this.userId,
        name: this.displayName,
        room: this.roomName,
        variant: this.variant,
      }),
    })
    if (!response.ok) {
      let message = `Token request failed (${response.status})`
      try {
        const body = (await response.json()) as { error?: string }
        if (body.error) message = body.error
      } catch {
        // The body was not JSON. The status line is enough.
      }
      throw new Error(message)
    }
    const body = (await response.json()) as { token?: string; url?: string }
    if (!body.token || !body.url) throw new Error('Token service returned an incomplete response')
    return { token: body.token, url: body.url }
  }

  private recompute(local: LocalPose): void {
    this.syncZone(zoneAt(this.zones, local.x, local.y))
    const targets: Array<{ identity: string; name: string }> = []
    const heard: string[] = []
    for (const pose of this.poses.values()) {
      const participant = this.room?.remoteParticipants.get(pose.identity)
      pose.talking = participant?.isSpeaking ?? false
      const hear = computeHear(
        { x: local.x, y: local.y, status: this.status },
        { x: pose.x, y: pose.y, status: pose.status },
        this.zones,
        this.accepted.has(pose.identity),
      )
      this.gains.set(pose.identity, hear.gain)
      this.mixer.setGain(pose.identity, hear.gain)
      if (hear.knock) targets.push({ identity: pose.identity, name: pose.name })
      if (hear.gain > 0) heard.push(pose.identity)
    }
    targets.sort((a, b) => a.name.localeCompare(b.name))
    this.knockTargets = targets
    for (const notice of this.conversations.update(heard, this.zoneName, Date.now())) {
      this.emitUsage(notice.name, notice.props)
    }
  }

  private syncZone(next: Zone | null): void {
    const same = this.zone?.name === next?.name && this.zone?.type === next?.type
    if (same || (!this.zone && !next)) {
      this.zoneName = next?.name ?? null
      return
    }
    if (this.zone) {
      this.emitUsage('room_left', {
        room_id: this.zone.name,
        room_type: this.zone.type,
        is_private: this.zone.type === 'meeting',
      })
    }
    if (next) {
      this.emitUsage('room_entered', {
        room_id: next.name,
        room_type: next.type,
        is_private: next.type === 'meeting',
      })
    }
    this.zone = next
    this.zoneName = next?.name ?? null
  }

  private maybeSend(pose: LocalPose): void {
    const quant: SentPose = {
      x: round1(pose.x),
      y: round1(pose.y),
      dir: pose.dir,
      moving: pose.moving,
      status: this.status,
      variant: this.variant,
    }
    const now = performance.now()
    const prev = this.lastSent
    const same =
      !!prev &&
      prev.x === quant.x &&
      prev.y === quant.y &&
      prev.dir === quant.dir &&
      prev.moving === quant.moving &&
      prev.status === quant.status &&
      prev.variant === quant.variant
    const stopped = Boolean(prev?.moving && !quant.moving)
    const statusChanged = Boolean(prev && prev.status !== quant.status)
    const due = now - this.lastSentAt >= POS_SEND_INTERVAL_MS
    const heartbeat = now - this.lastSentAt >= POS_HEARTBEAT_MS
    if (!prev || stopped || statusChanged || (!same && due) || heartbeat) {
      this.flush(quant, !prev || stopped || statusChanged)
    }
  }

  private flush(pose: SentPose, reliable: boolean): void {
    if (!this.room || this.room.state !== ConnectionState.Connected) return
    this.seq += 1
    const message: PosMessage = { v: 1, kind: 'pos', seq: this.seq, ...pose }
    this.lastSent = pose
    this.lastSentAt = performance.now()
    this.publish(message, reliable)
  }

  private publish(message: Parameters<typeof encodeMessage>[0], reliable: boolean): void {
    if (!this.room || this.room.state !== ConnectionState.Connected) return
    const topic = message.kind === 'pos' ? 'pos' : 'signal'
    const payload = encodeMessage(message) as Uint8Array<ArrayBuffer>
    void this.room.localParticipant.publishData(payload, { reliable, topic }).catch((error: unknown) => {
      console.warn('LiveKit data send failed', error)
    })
  }

  private async publishAttributes(): Promise<void> {
    const room = this.room
    if (!room || room.state !== ConnectionState.Connected) return
    try {
      await room.localParticipant.setAttributes({
        status: this.status,
        variant: this.variant,
      })
    } catch (error) {
      console.warn('Could not publish status attribute', error)
    }
  }

  private onData = (payload: Uint8Array, participant?: Participant): void => {
    if (!participant || participant.identity === this.userId) return
    const message = parseMessage(payload)
    if (!message) return
    if (message.kind === 'pos') {
      this.applyPose(participant, message)
      return
    }
    if (message.to !== this.userId) return
    if (message.kind === 'knock') {
      if (!this.incoming.some((knock) => knock.identity === participant.identity)) {
        this.incoming = [...this.incoming, { identity: participant.identity, name: participant.name || 'Someone' }]
      }
      const pose = this.poses.get(participant.identity)
      if (pose) pose.knockUntil = performance.now() + 4000
      this.emit(true)
      return
    }
    this.accepted.add(participant.identity)
    if (this.localPose) this.recompute(this.localPose)
    this.emit(true)
  }

  private applyPose(participant: Participant, message: PosMessage): void {
    const existing = this.poses.get(participant.identity)
    if (existing && message.seq <= existing.seq) return
    this.poses.set(participant.identity, {
      identity: participant.identity,
      name: participant.name || existing?.name || 'Someone',
      variant: sanitizeVariant(message.variant || variantFromMetadata(participant.metadata)),
      x: message.x,
      y: message.y,
      dir: message.dir,
      moving: message.moving,
      status: message.status,
      seq: message.seq,
      talking: existing?.talking ?? false,
      knockUntil: existing?.knockUntil ?? 0,
    })
    if (this.localPose) this.recompute(this.localPose)
  }

  private onAttributes = (changed: Record<string, string>, participant: Participant): void => {
    if (participant.identity === this.userId) return
    const status = changed.status
    if (status !== 'online' && status !== 'away' && status !== 'focus') return
    this.attributeStatus.set(participant.identity, status)
    const pose = this.poses.get(participant.identity)
    if (pose) pose.status = status
    if (this.localPose) this.recompute(this.localPose)
    this.emit(true)
  }

  private onTrackSubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant): void => {
    if (track.kind !== Track.Kind.Audio) return
    this.mixer.attach(participant.identity, track.mediaStreamTrack)
    const gain = this.gains.get(participant.identity) ?? 0
    this.mixer.setGain(participant.identity, gain)
    this.emit(true)
  }

  private onTrackUnsubscribed = (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant): void => {
    if (track.kind !== Track.Kind.Audio) return
    this.mixer.detach(participant.identity)
    this.emit(true)
  }

  private onParticipantConnected = (): void => {
    if (this.lastSent) this.flush(this.lastSent, true)
    this.emit(true)
  }

  private onParticipantDisconnected = (participant: RemoteParticipant): void => {
    this.poses.delete(participant.identity)
    this.attributeStatus.delete(participant.identity)
    this.gains.delete(participant.identity)
    this.accepted.delete(participant.identity)
    this.mixer.detach(participant.identity)
    this.incoming = this.incoming.filter((knock) => knock.identity !== participant.identity)
    this.knockTargets = this.knockTargets.filter((knock) => knock.identity !== participant.identity)
    if (this.localPose) this.recompute(this.localPose)
    this.emit(true)
  }

  private onDisconnected = (reason?: DisconnectReason): void => {
    if (this.closed) return
    this.warning = 'Disconnected from the office'
    this.endSession(reason === DisconnectReason.CONNECTION_TIMEOUT ? 'timeout' : 'error')
    this.emit(true)
  }

  private async sampleQuality(): Promise<void> {
    const room = this.room
    if (!room || room.state !== ConnectionState.Connected || this.ended) return
    const records: StatRecord[] = []
    const tracks: SdkTrack[] = []
    for (const pub of room.localParticipant.trackPublications.values()) {
      if (pub.track) tracks.push(pub.track)
    }
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.track) tracks.push(pub.track)
      }
    }
    for (const track of tracks) {
      try {
        const report = await track.getRTCStatsReport()
        report?.forEach((stat) => {
          records.push(stat as StatRecord)
        })
      } catch {
        // A missing stats report is not a join failure.
      }
    }
    const sample = qualityFromStats(records)
    if (sample) this.emitUsage('av_quality_sample', { ...sample })
  }

  private watchPresence(): void {
    if (this.presenceAbort || typeof window === 'undefined' || typeof document === 'undefined') return
    const abort = new AbortController()
    this.presenceAbort = abort
    this.lastActivity = Date.now()
    const activity = () => {
      this.lastActivity = Date.now()
      if (this.status === 'away' && this.statusSource === 'idle') this.applyAuto('activity')
    }
    const opts = { capture: true, signal: abort.signal }
    window.addEventListener('pointerdown', activity, opts)
    window.addEventListener('keydown', activity, opts)
    window.addEventListener('mousemove', activity, opts)
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') {
          this.hiddenAt = Date.now()
        } else {
          this.hiddenAt = null
          this.lastActivity = Date.now()
          this.applyAuto('visible')
        }
      },
      { signal: abort.signal },
    )
    this.awayTimer = setInterval(() => this.tickAway(), 1000)
  }

  private tickAway(): void {
    const now = Date.now()
    if (this.hiddenAt !== null && now - this.hiddenAt >= this.hiddenMs) {
      this.applyAuto('hidden')
      return
    }
    if (now - this.lastActivity >= this.idleMs) this.applyAuto('idle')
  }

  private applyAuto(event: AwayEvent): void {
    const next = reduceAway({ status: this.status, source: this.statusSource }, event)
    if (next.status === this.status) return
    this.setStatus(next.status, next.source)
  }

  private endSession(reason: 'close' | 'timeout' | 'error'): void {
    if (this.ended) return
    this.stopTimers()
    for (const notice of this.conversations.finish(Date.now())) {
      this.writeUsage(notice.name, notice.props)
    }
    if (this.zone) {
      this.writeUsage('room_left', {
        room_id: this.zone.name,
        room_type: this.zone.type,
        is_private: this.zone.type === 'meeting',
      })
      this.zone = null
    }
    const duration_s = this.connectedAt ? Math.max(0, Math.floor((Date.now() - this.connectedAt) / 1000)) : 0
    this.writeUsage('session_ended', { session_id: this.sessionId, duration_s, reason })
    this.ended = true
  }

  private stopTimers(): void {
    this.presenceAbort?.abort()
    this.presenceAbort = null
    if (this.awayTimer) clearInterval(this.awayTimer)
    this.awayTimer = null
    if (this.qualityTimer) clearInterval(this.qualityTimer)
    this.qualityTimer = null
  }

  private emitUsage(name: UsageEventName, props: Record<string, unknown>): void {
    if (this.ended) return
    this.writeUsage(name, props)
  }

  private writeUsage(name: UsageEventName, props: Record<string, unknown>): void {
    this.usage.emit({
      name,
      user_id: this.userId,
      session_id: this.sessionId,
      props,
      ts: new Date().toISOString(),
    })
  }

  private uiSignature = ''

  private emit(force: boolean): void {
    const next = this.snapshot()
    const signature = JSON.stringify(next)
    if (!force && signature === this.uiSignature) return
    this.uiSignature = signature
    this.ui = next
    for (const listener of this.listeners) listener()
  }

  private snapshot(): OfficeUi {
    const peers = this.getPoses()
      .map((pose) => ({
        identity: pose.identity,
        name: pose.name,
        status: pose.status,
        gain: this.gains.get(pose.identity) ?? 0,
        zoneName: zoneAt(this.zones, pose.x, pose.y)?.name ?? null,
        talking: pose.talking,
        subscribed: this.mixer.has(pose.identity),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      roomName: this.roomName,
      zoneName: this.zoneName,
      status: this.status,
      micEnabled: this.micEnabled,
      displayName: this.displayName,
      peers,
      knockTargets: this.knockTargets,
      incomingKnocks: this.incoming,
      warning: this.warning,
    }
  }
}
