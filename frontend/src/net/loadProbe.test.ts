import { describe, expect, it } from 'vitest'
import { LoadProbe } from './loadProbe'

describe('load probe', () => {
  it('reports connect and first-audio times from the join start', () => {
    const probe = new LoadProbe()
    probe.markJoinStart(1000)
    probe.markConnected(420)
    probe.markSubscribed(1300)
    probe.markAudio(1800)
    expect(probe.snapshot()).toMatchObject({
      msToConnect: 420,
      msToFirstSubscribe: 300,
      msToFirstAudio: 800,
    })
  })

  it('counts position messages and latencies only inside the sample window', () => {
    const probe = new LoadProbe()
    probe.notePosSent()
    probe.notePosReceived(1_000, 1_050)
    probe.beginWindow(0)
    probe.notePosSent()
    probe.notePosReceived(5_000, 5_040)
    probe.notePosReceived(Number.NaN, 5_040)
    probe.notePosReceived(5_000, 40_000)
    const window = probe.endWindow(1000)
    expect(window.posSent).toBe(1)
    expect(window.posReceived).toBe(3)
    expect(window.latenciesMs).toEqual([40])
    expect(window.elapsedMs).toBe(1000)
    expect(probe.snapshot().posSent).toBe(2)
    expect(probe.snapshot().posReceived).toBe(4)
  })
})
