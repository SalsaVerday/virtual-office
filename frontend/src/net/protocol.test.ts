import { describe, expect, it } from 'vitest'
import { encodeMessage, parseMessage } from './protocol'

describe('position messages', () => {
  it('round-trips the send timestamp used for latency', () => {
    const bytes = encodeMessage({
      v: 1,
      kind: 'pos',
      x: 10,
      y: 20,
      dir: 'down',
      moving: false,
      seq: 3,
      status: 'online',
      variant: 'v00',
      t: 1_700_000_000_000,
    })
    expect(parseMessage(bytes)).toMatchObject({ kind: 'pos', t: 1_700_000_000_000, seq: 3 })
  })

  it('still parses a position packet that has no timestamp', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        v: 1,
        kind: 'pos',
        x: 1,
        y: 2,
        dir: 'left',
        moving: true,
        seq: 1,
        status: 'away',
        variant: 'v04',
      }),
    )
    const message = parseMessage(bytes)
    expect(message).toMatchObject({ kind: 'pos', x: 1, status: 'away' })
    expect(message && message.kind === 'pos' ? message.t : false).toBeUndefined()
  })
})
