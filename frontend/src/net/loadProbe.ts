export type LoadSnapshot = {
  msToConnect: number | null
  msToFirstSubscribe: number | null
  msToFirstAudio: number | null
  posSent: number
  posReceived: number
}

export type SampleWindow = {
  elapsedMs: number
  posSent: number
  posReceived: number
  latenciesMs: number[]
}

/** Counters the load-test harness reads. Cheap enough to keep on in every session. */
export class LoadProbe {
  private joinStartedAt = 0
  private firstSubscribedAt: number | null = null
  private firstAudioAt: number | null = null
  msToConnect: number | null = null
  posSent = 0
  posReceived = 0
  private window: { at: number; posSent: number; posReceived: number; latencies: number[] } | null = null

  markJoinStart(now = performance.now()): void {
    this.joinStartedAt = now
  }

  markConnected(ms: number): void {
    this.msToConnect = ms
  }

  markSubscribed(now = performance.now()): void {
    if (this.firstSubscribedAt == null) this.firstSubscribedAt = now
  }

  markAudio(now = performance.now()): void {
    if (this.firstAudioAt == null) this.firstAudioAt = now
  }

  get sawAudio(): boolean {
    return this.firstAudioAt != null
  }

  notePosSent(): void {
    this.posSent += 1
  }

  notePosReceived(sentAt: number | undefined, now = Date.now()): void {
    this.posReceived += 1
    if (!this.window || sentAt == null || !Number.isFinite(sentAt)) return
    const latency = now - sentAt
    if (latency < 0 || latency > 30_000) return
    this.window.latencies.push(latency)
  }

  beginWindow(now = performance.now()): void {
    this.window = { at: now, posSent: this.posSent, posReceived: this.posReceived, latencies: [] }
  }

  endWindow(now = performance.now()): SampleWindow {
    const start = this.window
    this.window = null
    if (!start) return { elapsedMs: 0, posSent: 0, posReceived: 0, latenciesMs: [] }
    return {
      elapsedMs: Math.max(0, now - start.at),
      posSent: this.posSent - start.posSent,
      posReceived: this.posReceived - start.posReceived,
      latenciesMs: start.latencies,
    }
  }

  snapshot(): LoadSnapshot {
    const sinceJoin = (at: number | null) => (at == null || this.joinStartedAt === 0 ? null : Math.round(at - this.joinStartedAt))
    return {
      msToConnect: this.msToConnect,
      msToFirstSubscribe: sinceJoin(this.firstSubscribedAt),
      msToFirstAudio: sinceJoin(this.firstAudioAt),
      posSent: this.posSent,
      posReceived: this.posReceived,
    }
  }
}
