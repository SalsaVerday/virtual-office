import type { UsageEvent, UsageSink } from './types'

const STORAGE_KEY = 'vo.events.v1'
const MAX_EVENTS = 1000

function readStore(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const probe = '__vo'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return null
  }
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Browser-local event log. Used when Supabase is not configured, and as the dev/staging buffer. */
export class LocalEventSink implements UsageSink {
  private memory: UsageEvent[] | null = null

  emit(event: UsageEvent): void {
    const next = [...this.list(), event]
    const trimmed = next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next
    const store = readStore()
    if (!store) {
      this.memory = trimmed
      return
    }
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      this.memory = null
    } catch {
      this.memory = trimmed.slice(Math.max(0, trimmed.length - 200))
      try {
        store.setItem(STORAGE_KEY, JSON.stringify(this.memory))
      } catch {
        // Quota is exhausted. Keep the tail in memory for this page.
      }
    }
  }

  async load(): Promise<UsageEvent[]> {
    return this.list()
  }

  list(): UsageEvent[] {
    if (this.memory) return this.memory.map((event) => ({ ...event, props: { ...event.props } }))
    const store = readStore()
    if (!store) return []
    try {
      const raw = store.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as UsageEvent[]
      if (!Array.isArray(parsed)) return []
      return parsed
    } catch {
      return []
    }
  }

  exportJson(): string {
    return JSON.stringify(this.list(), null, 2)
  }

  exportCsv(): string {
    const rows = ['ts,name,user_id,session_id,props']
    for (const event of this.list()) {
      rows.push(
        [
          csvField(event.ts),
          csvField(event.name),
          csvField(event.user_id),
          csvField(event.session_id),
          csvField(JSON.stringify(event.props)),
        ].join(','),
      )
    }
    return rows.join('\n')
  }
}
