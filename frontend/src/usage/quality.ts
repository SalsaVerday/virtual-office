export type StatRecord = {
  type?: string
  kind?: string
  jitter?: number
  packetsLost?: number
  packetsReceived?: number
  currentRoundTripTime?: number
  state?: string
  nominated?: boolean
}

export type QualitySample = {
  rtt_ms: number | null
  jitter_ms: number | null
  packet_loss_pct: number | null
}

/** Pull rtt, jitter, and loss out of a WebRTC stats dump. Returns null when the report has none of them. */
export function qualityFromStats(records: Iterable<StatRecord>): QualitySample | null {
  let rtt: number | null = null
  let jitterSum = 0
  let jitterCount = 0
  let lost = 0
  let received = 0
  let sawPackets = false

  for (const stat of records) {
    if (stat.type === 'candidate-pair' && typeof stat.currentRoundTripTime === 'number') {
      const nominated = stat.nominated === true || stat.state === 'succeeded'
      if (nominated || rtt === null) rtt = stat.currentRoundTripTime * 1000
    }
    if (stat.type === 'inbound-rtp' && (stat.kind === 'audio' || stat.kind === undefined)) {
      if (typeof stat.jitter === 'number') {
        jitterSum += stat.jitter * 1000
        jitterCount += 1
      }
      if (typeof stat.packetsLost === 'number' || typeof stat.packetsReceived === 'number') {
        sawPackets = true
        lost += stat.packetsLost ?? 0
        received += stat.packetsReceived ?? 0
      }
    }
  }

  if (rtt === null && jitterCount === 0 && !sawPackets) return null
  const total = lost + received
  return {
    rtt_ms: rtt === null ? null : Math.round(rtt),
    jitter_ms: jitterCount === 0 ? null : Math.round(jitterSum / jitterCount),
    packet_loss_pct: !sawPackets || total <= 0 ? null : Math.round((lost / total) * 1000) / 10,
  }
}
