import { describe, expect, it } from 'vitest'
import { ConversationTracker, CONVERSATION_COUNT_S } from './conversation'
import { createEventSink } from './createSink'
import { LocalEventSink } from './localSink'
import { qualityFromStats } from './quality'
import type { UsageEvent } from './types'

function event(name: UsageEvent['name'], props: Record<string, unknown> = {}): UsageEvent {
  return {
    name,
    user_id: 'dev:ada',
    session_id: '11111111-1111-4111-8111-111111111111',
    props,
    ts: '2026-10-31T00:00:00.000Z',
  }
}

describe('local event sink', () => {
  it('keeps events in memory when Supabase is not configured and exports csv', () => {
    const sink = createEventSink({})
    sink.emit(event('session_started', { browser: 'chrome', entry: 'direct' }))
    sink.emit(event('status_changed', { from: 'online', to: 'focus', source: 'manual' }))
    expect(sink.list().map((entry) => entry.name)).toEqual(['session_started', 'status_changed'])
    const csv = sink.exportCsv()
    expect(csv.split('\n')).toHaveLength(3)
    expect(csv).toContain('status_changed')
    expect(csv).toContain('focus')
    const parsed = JSON.parse(sink.exportJson()) as UsageEvent[]
    expect(parsed[1].props).toMatchObject({ from: 'online', to: 'focus', source: 'manual' })
  })

  it('round-trips a quoted prop through the local sink', () => {
    const sink = new LocalEventSink()
    sink.emit(event('join_failed', { error_code: 'token', note: 'say "no"' }))
    expect(sink.list()[0].props).toMatchObject({ error_code: 'token', note: 'say "no"' })
    expect(sink.exportCsv()).toContain('join_failed')
    expect(sink.exportCsv()).toContain('token')
  })
})

describe('conversations', () => {
  it('records duration and only marks a conversation countable at 30 seconds', () => {
    const tracker = new ConversationTracker('ada')
    const started = tracker.update(['grace'], 'Standup', 0)
    expect(started.map((notice) => notice.name)).toEqual(['conversation_started'])
    expect(tracker.update(['grace'], 'Standup', 10_000)).toEqual([])
    const early = tracker.update([], null, 29_000)
    expect(early[0]).toMatchObject({
      name: 'conversation_ended',
      props: { duration_s: 29, counts: false, room_id: 'Standup' },
    })

    const again = new ConversationTracker('ada')
    again.update(['grace'], 'Lounge', 0)
    const counted = again.finish(CONVERSATION_COUNT_S * 1000)
    expect(counted[0].props).toMatchObject({ duration_s: 30, counts: true })
  })

  it('lets the lowest id emit so a pair is not stored twice', () => {
    const low = new ConversationTracker('ada')
    const high = new ConversationTracker('grace')
    expect(low.update(['grace'], null, 0)).toHaveLength(1)
    expect(high.update(['ada'], null, 0)).toEqual([])
  })
})

describe('av quality', () => {
  it('reads rtt, jitter, and loss from a stats report', () => {
    const sample = qualityFromStats([
      { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0.042 },
      { type: 'inbound-rtp', kind: 'audio', jitter: 0.008, packetsLost: 2, packetsReceived: 98 },
      { type: 'outbound-rtp', kind: 'audio', jitter: 0.1 },
    ])
    expect(sample).toEqual({ rtt_ms: 42, jitter_ms: 8, packet_loss_pct: 2 })
  })

  it('returns null when the report has no audio stats', () => {
    expect(qualityFromStats([{ type: 'transport' }])).toBeNull()
  })
})
