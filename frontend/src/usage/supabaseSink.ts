import type { SupabaseClient } from '@supabase/supabase-js'
import { eventsFromSupabaseRows } from './adminStats'
import type { UsageEvent } from './types'

/**
 * Admin read of `usage_events` with the anon key. Writes go through `/api/usage`.
 */
export class SupabaseEventSink {
  private clientPromise: Promise<SupabaseClient> | null = null

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  /**
   * Admin read of `usage_events`. Select policies still apply. An empty or failed
   * read falls back to the local sink.
   */
  async load(): Promise<UsageEvent[]> {
    const supabase = await this.client()
    const { data, error } = await supabase
      .from('usage_events')
      .select('name, user_id, session_id, props, ts')
      .order('ts', { ascending: true })
      .limit(5000)
    if (error) throw error
    return eventsFromSupabaseRows(data ?? [])
  }

  private async client(): Promise<SupabaseClient> {
    if (!this.clientPromise) {
      this.clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(this.url, this.anonKey))
    }
    return this.clientPromise
  }
}
