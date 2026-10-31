import { preferRemoteEvents } from './adminStats'
import { LocalEventSink } from './localSink'
import { SupabaseEventSink } from './supabaseSink'
import type { UsageEvent, UsageSink } from './types'

class FanoutSink implements UsageSink {
  constructor(
    private readonly local: LocalEventSink,
    private readonly remote: SupabaseEventSink,
  ) {}

  emit(event: UsageEvent): void {
    this.local.emit(event)
    this.remote.persist(event)
  }

  list(): UsageEvent[] {
    return this.local.list()
  }

  async load(): Promise<UsageEvent[]> {
    try {
      const remote = await this.remote.load()
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

/** Supabase when both public env vars are set. Otherwise the local sink only. Never throws on a missing project. */
export function createEventSink(
  env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string } = import.meta.env,
): UsageSink {
  const local = new LocalEventSink()
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !key) return local
  return new FanoutSink(local, new SupabaseEventSink(url, key))
}
