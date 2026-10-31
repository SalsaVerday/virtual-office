import type { UsageEvent } from './types'

export type PresenceRow = {
  date: string
  userId: string
  seconds: number
}

export type AdminReport = {
  /** UTC days, oldest first. Users are distinct people with a session that day. */
  dailyActive: Array<{ date: string; users: number }>
  /** Seconds present, split at UTC midnight. Oldest day first, then user id. */
  presence: PresenceRow[]
  /** Conversations whose duration_s is at least 30. One row per UTC day. */
  conversations: Array<{ date: string; conversations: number }>
}

const COUNT_SECONDS = 30

/**
 * Daily active users, time present, and conversations of at least 30 seconds.
 * `now` closes a session that has started and not ended. Pass a fixed clock in tests.
 */
export function buildAdminReport(events: readonly UsageEvent[], now = Date.now()): AdminReport {
  const ordered = [...events].sort((a, b) => a.ts.localeCompare(b.ts))
  const active = new Map<string, Set<string>>()
  const presenceMs = new Map<string, number>()
  const open = new Map<string, { userId: string; start: number }>()

  for (const event of ordered) {
    if (event.name === 'session_started') {
      const start = Date.parse(event.ts)
      if (Number.isNaN(start)) continue
      open.set(event.session_id, { userId: event.user_id, start })
      addActive(active, utcDate(start), event.user_id)
    }
    if (event.name !== 'session_ended') continue
    const end = Date.parse(event.ts)
    if (Number.isNaN(end)) continue
    const started = open.get(event.session_id)
    open.delete(event.session_id)
    const durationMs = secondsProp(event.props.duration_s)
    const start = started?.start ?? (durationMs == null ? end : end - durationMs)
    const userId = started?.userId ?? event.user_id
    addInterval(active, presenceMs, userId, start, end)
  }

  for (const started of open.values()) {
    if (started.start < now) addInterval(active, presenceMs, started.userId, started.start, now)
  }

  const conversations = countConversations(ordered)
  const dates = new Set<string>([...active.keys(), ...conversations.keys()])

  return {
    dailyActive: [...dates]
      .sort()
      .map((date) => ({ date, users: active.get(date)?.size ?? 0 })),
    presence: [...presenceMs.entries()]
      .map(([key, ms]) => {
        const [date, userId] = key.split('\0')
        return { date, userId, seconds: Math.round(ms / 1000) }
      })
      .filter((row) => row.seconds > 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.userId.localeCompare(b.userId)),
    conversations: [...dates]
      .sort()
      .map((date) => ({ date, conversations: conversations.get(date) ?? 0 })),
  }
}

export function adminReportCsv(report: AdminReport): string {
  const rows = ['metric,date,user_id,value']
  for (const day of report.dailyActive) rows.push(['dau', day.date, '', String(day.users)].join(','))
  for (const row of report.presence) rows.push(['presence_s', row.date, csvField(row.userId), String(row.seconds)].join(','))
  for (const day of report.conversations) rows.push(['conversations', day.date, '', String(day.conversations)].join(','))
  return rows.join('\n')
}

export function formatPresence(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remain = total % 60
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  if (minutes > 0 && remain > 0) return `${minutes}m ${remain}s`
  if (minutes > 0) return `${minutes}m`
  return `${total}s`
}

/**
 * Prefer a non-empty Supabase read. An empty remote (or a failed one, passed as null)
 * keeps the local sink, which is what dev identities use today.
 */
export function preferRemoteEvents(remote: UsageEvent[] | null, local: readonly UsageEvent[]): UsageEvent[] {
  if (remote && remote.length > 0) return remote
  return local.map((event) => ({ ...event, props: { ...event.props } }))
}

export function eventsFromSupabaseRows(
  rows: readonly { name?: unknown; user_id?: unknown; session_id?: unknown; props?: unknown; ts?: unknown }[],
): UsageEvent[] {
  const events: UsageEvent[] = []
  for (const row of rows) {
    if (typeof row.name !== 'string' || typeof row.user_id !== 'string' || typeof row.session_id !== 'string') continue
    if (typeof row.ts !== 'string') continue
    const props = row.props && typeof row.props === 'object' && !Array.isArray(row.props) ? (row.props as Record<string, unknown>) : {}
    events.push({
      name: row.name as UsageEvent['name'],
      user_id: row.user_id,
      session_id: row.session_id,
      props,
      ts: row.ts,
    })
  }
  return events
}

function countConversations(events: readonly UsageEvent[]): Map<string, number> {
  const counts = new Map<string, number>()
  const seen = new Set<string>()
  for (const event of events) {
    if (event.name !== 'conversation_ended') continue
    const duration = secondsProp(event.props.duration_s)
    if (duration == null || duration < COUNT_SECONDS) continue
    const id = typeof event.props.conversation_id === 'string' ? event.props.conversation_id : ''
    const date = utcDate(Date.parse(event.ts))
    if (!date) continue
    const key = `${date}\0${id || event.session_id + event.ts}`
    if (seen.has(key)) continue
    seen.add(key)
    counts.set(date, (counts.get(date) ?? 0) + 1)
  }
  return counts
}

function addInterval(
  active: Map<string, Set<string>>,
  presenceMs: Map<string, number>,
  userId: string,
  start: number,
  end: number,
): void {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    if (Number.isFinite(start)) addActive(active, utcDate(start), userId)
    return
  }
  let cursor = start
  while (cursor < end) {
    const nextMidnight = utcMidnightAfter(cursor)
    const sliceEnd = Math.min(end, nextMidnight)
    const date = utcDate(cursor)
    addActive(active, date, userId)
    const key = `${date}\0${userId}`
    presenceMs.set(key, (presenceMs.get(key) ?? 0) + (sliceEnd - cursor))
    cursor = sliceEnd
  }
}

function addActive(active: Map<string, Set<string>>, date: string, userId: string): void {
  if (!date) return
  const set = active.get(date) ?? new Set<string>()
  set.add(userId)
  active.set(date, set)
}

function utcDate(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  return new Date(ms).toISOString().slice(0, 10)
}

function utcMidnightAfter(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
}

function secondsProp(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}
