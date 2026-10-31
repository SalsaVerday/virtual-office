import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client'
import { computeHear, zoneAt } from '../audio/proximity'
import { ProximityMixer } from '../audio/mixer'
import { POS_HEARTBEAT_MS, POS_SEND_INTERVAL_MS, sanitizeRoom, sanitizeVariant } from '../config'
import { noopUsage, type UsageSink } from '../metrics'
import type { QaParticipant, QaSubscription } from '../qa/types'
import type { Direction, PresenceStatus, Zone } from '../types'
import type { SessionUser } from '../auth/types'
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

export class OfficeSession {
  readonly userId: string
  readonly displayName: string
  readonly variant: string
  roomName = ''
  status: PresenceStatus = 'online'
  zoneName: string | null = null
  private room: Room | null = null
  private readonly mixer: ProximityMixer
  private zones: Zone[] = []
  private readonly poses = new Map<string, RemotePose>()
  private readonly accepted = new Set<string>()
  private readonly gains = new Map<string, number>()
  private readonly heard = new Set<string>()
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

  constructor(
    user: SessionUser,
    audio: AudioContext,
    private readonly usage: UsageSink = noopUsage,
  ) {
    this.userId = user.userId
    this.displayName = user.displayName
    this.variant = sanitizeVariant(user.variant)
    this.mixer = new ProximityMixer(audio)
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
    this.usage.record({
      type: 'session-started',
      userId: this.userId,
      room: this.roomName,
      at: Date.now(),
    })
    this.emit(true)
  }

  async close(): Promise<void> {
    this.closed = true
    this.room?.removeAllListeners()
    await this.room?.disconnect()
    this.room = null
    this.mixer.close()
  }

  setZones(zones: Zone[]): void {
    this.zones = zones
    if (this.localPose) this.updateFrame(this.localPose)
  }

  setStatus(status: PresenceStatus): void {
    this.status = status
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
  }

  acceptKnock(identity: string): void {
    this.accepted.add(identity)
    this.incoming = this.incoming.filter((knock) => knock.identity !== identity)
    this.publish({ v: 1, kind: 'knock-accept', to: identity }, true)
    if (this.localPose) this.recompute(this.localPose)
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
        status: pose?.status ?? 'online',
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
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        // ignore
      }
      throw new Error(message)
    }
    const body = (await response.json()) as { token?: string; url?: string }
    if (!body.token || !body.url) throw new Error('Token service returned an incomplete response')
    return { token: body.token, url: body.url }
  }

  private recompute(local: LocalPose): void {
    this.zoneName = zoneAt(this.zones, local.x, local.y)?.name ?? null
    const targets: Array<{ identity: string; name: string }> = []
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
      if (hear.gain > 0 && !this.heard.has(pose.identity)) {
        this.heard.add(pose.identity)
        this.usage.record({
          type: 'proximity-conversation',
          userId: this.userId,
          peerId: pose.identity,
          room: this.roomName,
        })
      }
      if (hear.gain === 0) this.heard.delete(pose.identity)
    }
    targets.sort((a, b) => a.name.localeCompare(b.name))
    this.knockTargets = targets
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
    this.gains.delete(participant.identity)
    this.heard.delete(participant.identity)
    this.mixer.detach(participant.identity)
    this.incoming = this.incoming.filter((knock) => knock.identity !== participant.identity)
    this.knockTargets = this.knockTargets.filter((knock) => knock.identity !== participant.identity)
    this.emit(true)
  }

  private onDisconnected = (): void => {
    if (this.closed) return
    this.warning = 'Disconnected from the office'
    this.emit(true)
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
