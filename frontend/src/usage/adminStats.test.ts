import { describe, expect, it } from 'vitest'
import { adminReportCsv, buildAdminReport, eventsFromSupabaseRows, formatPresence, preferRemoteEvents } from './adminStats'
import type { UsageEvent } from './types'

function ev(partial: Partial<UsageEvent> & Pick<UsageEvent, 'name' | 'ts'>): UsageEvent {
  return {
    name: partial.name,
    user_id: partial.user_id ?? 'ada',
    session_id: partial.session_id ?? 'sess-ada',
    props: partial.props ?? {},
    ts: partial.ts,
  }
}

describe('admin usage report', () => {
  it('counts daily active users and splits presence across UTC midnight', () => {
    const report = buildAdminReport([
      ev({ name: 'session_started', ts: '2026-10-30T22:00:00.000Z', user_id: 'ada', session_id: 'ada-1' }),
      ev({
        name: 'session_ended',
        ts: '2026-10-31T00:30:00.000Z',
        user_id: 'ada',
        session_id: 'ada-1',
        props: { duration_s: 9000 },
      }),
      ev({ name: 'session_started', ts: '2026-10-31T15:00:00.000Z', user_id: 'grace', session_id: 'grace-1' }),
      ev({
        name: 'session_ended',
        ts: '2026-10-31T15:20:00.000Z',
        user_id: 'grace',
        session_id: 'grace-1',
        props: { duration_s: 1200 },
      }),
      ev({ name: 'session_started', ts: '2026-10-30T18:00:00.000Z', user_id: 'linus', session_id: 'linus-1' }),
      ev({
        name: 'session_ended',
        ts: '2026-10-30T18:10:00.000Z',
        user_id: 'linus',
        session_id: 'linus-1',
        props: { duration_s: 600 },
      }),
    ])

    expect(report.dailyActive).toEqual([
      { date: '2026-10-30', users: 2 },
      { date: '2026-10-31', users: 2 },
    ])
    expect(report.presence).toEqual([
      { date: '2026-10-30', userId: 'ada', seconds: 7200 },
      { date: '2026-10-30', userId: 'linus', seconds: 600 },
      { date: '2026-10-31', userId: 'ada', seconds: 1800 },
      { date: '2026-10-31', userId: 'grace', seconds: 1200 },
    ])
  })

  it('counts an open session up to the supplied clock', () => {
    const start = Date.parse('2026-10-31T12:00:00.000Z')
    const report = buildAdminReport(
      [ev({ name: 'session_started', ts: '2026-10-31T12:00:00.000Z', user_id: 'ada', session_id: 'open' })],
      start + 90_000,
    )
    expect(report.dailyActive).toEqual([{ date: '2026-10-31', users: 1 }])
    expect(report.presence).toEqual([{ date: '2026-10-31', userId: 'ada', seconds: 90 }])
  })

  it('counts a conversation once, and only when it lasted at least 30 seconds', () => {
    const report = buildAdminReport([
      ev({
        name: 'conversation_ended',
        ts: '2026-10-30T18:05:00.000Z',
        props: { conversation_id: 'ada+linus', duration_s: 12, counts: false },
      }),
      ev({
        name: 'conversation_ended',
        ts: '2026-10-30T19:00:00.000Z',
        props: { conversation_id: 'ada+grace', duration_s: 40, counts: true },
      }),
      ev({
        name: 'conversation_ended',
        ts: '2026-10-31T15:10:00.000Z',
        user_id: 'ada',
        props: { conversation_id: 'ada+grace', duration_s: 90, counts: true },
      }),
      ev({
        name: 'conversation_ended',
        ts: '2026-10-31T15:10:01.000Z',
        user_id: 'grace',
        props: { conversation_id: 'ada+grace', duration_s: 90, counts: true },
      }),
      ev({
        name: 'conversation_ended',
        ts: '2026-10-31T16:00:00.000Z',
        props: { conversation_id: 'short-flag', duration_s: 29, counts: true },
      }),
    ])

    expect(report.conversations).toEqual([
      { date: '2026-10-30', conversations: 1 },
      { date: '2026-10-31', conversations: 1 },
    ])
  })

  it('exports dau, presence, and conversations as csv', () => {
    const report = buildAdminReport([
      ev({ name: 'session_started', ts: '2026-10-31T15:00:00.000Z', user_id: 'ada, "lead"', session_id: 's' }),
      ev({
        name: 'session_ended',
        ts: '2026-10-31T15:01:00.000Z',
        user_id: 'ada, "lead"',
        session_id: 's',
        props: { duration_s: 60 },
      }),
      ev({
        name: 'conversation_ended',
        ts: '2026-10-31T15:01:00.000Z',
        props: { conversation_id: 'pair', duration_s: 30 },
      }),
    ])
    const csv = adminReportCsv(report)
    expect(csv.split('\n')[0]).toBe('metric,date,user_id,value')
    expect(csv).toContain('dau,2026-10-31,,1')
    expect(csv).toContain('presence_s,2026-10-31,"ada, ""lead""",60')
    expect(csv).toContain('conversations,2026-10-31,,1')
    expect(formatPresence(7200)).toBe('2h 00m')
    expect(formatPresence(90)).toBe('1m 30s')
    expect(formatPresence(12)).toBe('12s')
  })
})

describe('usage read fallback', () => {
  it('keeps the local sink until Supabase returns rows', () => {
    const local = [ev({ name: 'session_started', ts: '2026-10-31T00:00:00.000Z' })]
    expect(preferRemoteEvents(null, local)).toEqual(local)
    expect(preferRemoteEvents([], local)).toEqual(local)
    const remote = [ev({ name: 'session_ended', ts: '2026-10-31T01:00:00.000Z', user_id: 'remote' })]
    expect(preferRemoteEvents(remote, local).map((event) => event.user_id)).toEqual(['remote'])
  })

  it('maps Supabase usage_events rows and skips a row with no timestamp', () => {
    const events = eventsFromSupabaseRows([
      {
        name: 'session_started',
        user_id: 'ada',
        session_id: 's',
        props: { browser: 'chrome' },
        ts: '2026-10-31T00:00:00.000Z',
      },
      { name: 'session_started', user_id: 'ada', session_id: 's', props: {}, ts: null },
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ name: 'session_started', user_id: 'ada', props: { browser: 'chrome' } })
  })
})
