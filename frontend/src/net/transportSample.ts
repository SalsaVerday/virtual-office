export type RawStat = {
  id?: string
  type?: string
  kind?: string
  nominated?: boolean
  selected?: boolean
  state?: string
  bytesSent?: number
  bytesReceived?: number
  packetsReceived?: number
  selectedCandidatePairId?: string
}

export type TransportSnapshot = {
  bytesSent: number
  bytesReceived: number
  audioBytesSent: number
  audioBytesReceived: number
  audioPacketsReceived: number
  dataBytesSent: number
  dataBytesReceived: number
}

export const EMPTY_TRANSPORT: TransportSnapshot = {
  bytesSent: 0,
  bytesReceived: 0,
  audioBytesSent: 0,
  audioBytesReceived: 0,
  audioPacketsReceived: 0,
  dataBytesSent: 0,
  dataBytesReceived: 0,
}

/**
 * Fold WebRTC stats into byte counters.
 * The same peer connection is often reported once per track; stats are deduped
 * by id so those copies are not added twice. Selected or nominated candidate
 * pairs are the wire totals. Audio RTP and data-channel bytes are split out.
 */
export function transportFromStats(reports: Iterable<Iterable<[string, RawStat]>>): TransportSnapshot {
  const stats = new Map<string, RawStat>()
  for (const report of reports) {
    for (const [id, stat] of report) {
      const key = stat.id ?? id
      const prev = stats.get(key)
      if (!prev) {
        stats.set(key, stat)
        continue
      }
      const prevBytes = (prev.bytesSent ?? 0) + (prev.bytesReceived ?? 0)
      const nextBytes = (stat.bytesSent ?? 0) + (stat.bytesReceived ?? 0)
      if (nextBytes >= prevBytes) stats.set(key, stat)
    }
  }

  const selected = new Set<string>()
  for (const [id, stat] of stats) {
    if (stat.type === 'transport' && stat.selectedCandidatePairId) selected.add(stat.selectedCandidatePairId)
    if (stat.type === 'candidate-pair' && stat.selected && stat.id) selected.add(stat.id)
    if (stat.type === 'candidate-pair' && stat.selected && !stat.id) selected.add(id)
  }

  const pairs = [...stats.entries()].filter(([, stat]) => stat.type === 'candidate-pair')
  let chosen = pairs.filter(([id, stat]) => stat.nominated === true || selected.has(stat.id ?? id))
  if (chosen.length === 0) {
    const succeeded = pairs.filter(([, stat]) => stat.state === 'succeeded')
    succeeded.sort((a, b) => bytesOf(b[1]) - bytesOf(a[1]))
    chosen = succeeded.slice(0, 1)
  }

  const snapshot = { ...EMPTY_TRANSPORT }
  for (const [, stat] of chosen) {
    snapshot.bytesSent += stat.bytesSent ?? 0
    snapshot.bytesReceived += stat.bytesReceived ?? 0
  }
  for (const stat of stats.values()) {
    if (stat.type === 'outbound-rtp' && stat.kind === 'audio') snapshot.audioBytesSent += stat.bytesSent ?? 0
    if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
      snapshot.audioBytesReceived += stat.bytesReceived ?? 0
      snapshot.audioPacketsReceived += stat.packetsReceived ?? 0
    }
    if (stat.type === 'data-channel') {
      snapshot.dataBytesSent += stat.bytesSent ?? 0
      snapshot.dataBytesReceived += stat.bytesReceived ?? 0
    }
  }
  return snapshot
}

function bytesOf(stat: RawStat): number {
  return (stat.bytesSent ?? 0) + (stat.bytesReceived ?? 0)
}
