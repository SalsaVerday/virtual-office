/**
 * One Web Audio gain node per remote microphone.
 * LiveKit tracks are not attached to <audio> elements, or the room would play twice.
 */
export class ProximityMixer {
  private readonly nodes = new Map<
    string,
    { source: MediaStreamAudioSourceNode; gain: GainNode; commanded: number }
  >()

  constructor(readonly context: AudioContext) {}

  async resume(): Promise<void> {
    if (this.context.state === 'suspended') await this.context.resume()
  }

  attach(identity: string, track: MediaStreamTrack): void {
    this.detach(identity)
    const source = this.context.createMediaStreamSource(new MediaStream([track]))
    const gain = this.context.createGain()
    gain.gain.value = 0
    source.connect(gain)
    gain.connect(this.context.destination)
    this.nodes.set(identity, { source, gain, commanded: 0 })
  }

  setGain(identity: string, value: number): void {
    const node = this.nodes.get(identity)
    if (!node) return
    const next = Math.max(0, Math.min(1, value))
    if (Math.abs(node.commanded - next) < 0.001) return
    node.commanded = next
    const param = node.gain.gain
    const now = this.context.currentTime
    param.cancelScheduledValues(now)
    // Private rooms and the cutoff cut immediately so audio cannot leak during a fade.
    if (next <= 0.001) {
      param.setValueAtTime(0, now)
      return
    }
    param.setValueAtTime(param.value, now)
    param.linearRampToValueAtTime(next, now + 0.1)
  }

  commandedGain(identity: string): number | null {
    return this.nodes.get(identity)?.commanded ?? null
  }

  appliedGain(identity: string): number | null {
    const node = this.nodes.get(identity)
    return node ? node.gain.gain.value : null
  }

  has(identity: string): boolean {
    return this.nodes.has(identity)
  }

  detach(identity: string): void {
    const node = this.nodes.get(identity)
    if (!node) return
    node.source.disconnect()
    node.gain.disconnect()
    this.nodes.delete(identity)
  }

  close(): void {
    for (const identity of [...this.nodes.keys()]) this.detach(identity)
    void this.context.close()
  }
}
