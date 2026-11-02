import { preferRemoteEvents } from './adminStats'
import { LocalEventSink } from './localSink'
import { SupabaseEventSink } from './supabaseSink'
import type { UsageEvent, UsageSink } from './types'
import { UsageApiSink } from './usageApiSink'

class FanoutSink implements UsageSink {
  constructor(
    private readonly local: LocalEventSink,
    private readonly writer: UsageApiSink,
    private readonly reader: SupabaseEventSink | null,
  ) {}

  authorize(livekitToken: string): void {
    this.writer.authorize(livekitToken)
  }

  emit(event: UsageEvent): void {
    this.local.emit(event)
    this.writer.persist(event)
  }

  list(): UsageEvent[] {
    return this.local.list()
  }

  async load(): Promise<UsageEvent[]> {
    if (!this.reader) return this.local.list()
    try {
      const remote = await this.reader.load()
      return preferRemoteEvents(remote, this.local.list())
    } catch (error) {
      console.warn('Supabase usage read failed; using the local sink', error)
      return preferRemoteEvents(null, this.local.list())
    }
  }

  exportJson(): string {
    return this.local.exportJson()
  }

  exportCsv(): string {
    return this.local.exportCsv()
  }
}

/**
 * Always keeps a local copy. Writes go to `/api/usage` after the LiveKit token
 * arrives. The anon key is only used to read `usage_events` for the admin view.
 */
export function createEventSink(
  env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string } = import.meta.env,
): UsageSink {
  const local = new LocalEventSink()
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  const reader = url && key ? new SupabaseEventSink(url, key) : null
  return new FanoutSink(local, new UsageApiSink(), reader)
}
