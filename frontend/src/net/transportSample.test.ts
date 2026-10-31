import { describe, expect, it } from 'vitest'
import { transportFromStats, type RawStat } from './transportSample'

describe('transportFromStats', () => {
  it('sums the nominated pair, audio rtp, and data channels without double counting', () => {
    const report: Array<[string, { id: string; type: string; kind?: string; nominated?: boolean; state?: string; bytesSent?: number; bytesReceived?: number; packetsReceived?: number; selectedCandidatePairId?: string }]> = [
      ['pair-a', { id: 'pair-a', type: 'candidate-pair', nominated: true, bytesSent: 1000, bytesReceived: 4000 }],
      ['pair-b', { id: 'pair-b', type: 'candidate-pair', state: 'succeeded', bytesSent: 50, bytesReceived: 50 }],
      ['out', { id: 'out', type: 'outbound-rtp', kind: 'audio', bytesSent: 800 }],
      ['in', { id: 'in', type: 'inbound-rtp', kind: 'audio', bytesReceived: 3200, packetsReceived: 40 }],
      ['dc', { id: 'dc', type: 'data-channel', bytesSent: 100, bytesReceived: 200 }],
    ]
    const once = transportFromStats([report])
    const twice = transportFromStats([report, report])
    expect(once).toEqual({
      bytesSent: 1000,
      bytesReceived: 4000,
      audioBytesSent: 800,
      audioBytesReceived: 3200,
      audioPacketsReceived: 40,
      dataBytesSent: 100,
      dataBytesReceived: 200,
    })
    expect(twice).toEqual(once)
  })

  it('keeps two selected pairs when publish and subscribe use different connections', () => {
    const publisher: Array<[string, RawStat]> = [
      ['t1', { id: 't1', type: 'transport', selectedCandidatePairId: 'up' }],
      ['up', { id: 'up', type: 'candidate-pair', bytesSent: 500, bytesReceived: 20 }],
    ]
    const subscriber: Array<[string, RawStat]> = [
      ['t2', { id: 't2', type: 'transport', selectedCandidatePairId: 'down' }],
      ['down', { id: 'down', type: 'candidate-pair', bytesSent: 30, bytesReceived: 900 }],
      ['in', { id: 'in', type: 'inbound-rtp', kind: 'audio', bytesReceived: 700, packetsReceived: 10 }],
    ]
    const snapshot = transportFromStats([publisher, subscriber])
    expect(snapshot.bytesSent).toBe(530)
    expect(snapshot.bytesReceived).toBe(920)
    expect(snapshot.audioBytesReceived).toBe(700)
  })
})
