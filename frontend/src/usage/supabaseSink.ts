import type { SupabaseClient } from '@supabase/supabase-js'
import { eventsFromSupabaseRows } from './adminStats'
import { usageUserId } from './devUserId'
import type { UsageEvent } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Best-effort writer. `dev:…` identities become a UUIDv5 before insert so staging
 * dev-login can land in `usage_events`. Anything else that is not a uuid stays local.
 * Failures are logged and do not break the office.
 */
export class SupabaseEventSink {
  private tail: Promise<void> = Promise.resolve()
  private clientPromise: Promise<SupabaseClient> | null = null

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  /**
   * Admin read of `usage_events`. RLS still applies: a user sees their own rows,
   * and `users.is_admin` can see everyone's. Dev identities never get this far
   * on the write path; an empty result falls back to the local sink.
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

  persist(event: UsageEvent): void {
    this.tail = this.tail
      .then(async () => {
        const user_id = await usageUserId(event.user_id)
        if (!UUID_RE.test(user_id) || !UUID_RE.test(event.session_id)) return
        await this.write(user_id === event.user_id ? event : { ...event, user_id })
      })
      .catch((error: unknown) => {
        console.warn('Supabase usage write failed; the event is still in the local sink', error)
      })
  }

  private async client(): Promise<SupabaseClient> {
    if (!this.clientPromise) {
      this.clientPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(this.url, this.anonKey))
    }
    return this.clientPromise
  }

  private async write(event: UsageEvent): Promise<void> {
    const supabase = await this.client()
    if (event.name === 'session_started') {
      const { error: userError } = await supabase.from('users').upsert(
        { id: event.user_id },
        { onConflict: 'id', ignoreDuplicates: true },
      )
      if (userError) throw userError
      const { error: sessionError } = await supabase.from('sessions').upsert(
        {
          id: event.session_id,
          user_id: event.user_id,
          started_at: event.ts,
          client: typeof event.props.browser === 'string' ? event.props.browser : null,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
      if (sessionError) throw sessionError
    }
    if (event.name === 'session_ended') {
      const { error } = await supabase
        .from('sessions')
        .update({ ended_at: event.ts })
        .eq('id', event.session_id)
        .eq('user_id', event.user_id)
      if (error) throw error
    }
    const { error } = await supabase.from('usage_events').insert({
      user_id: event.user_id,
      session_id: event.session_id,
      name: event.name,
      props: event.props,
      ts: event.ts,
    })
    if (error) throw error
    await this.touchPresence(supabase, event)
  }

  private async touchPresence(supabase: SupabaseClient, event: UsageEvent): Promise<void> {
    try {
      if (event.name === 'status_changed' && typeof event.props.to === 'string') {
        const { error } = await supabase.from('presence').upsert(
          { user_id: event.user_id, status: event.props.to, last_seen_at: event.ts },
          { onConflict: 'user_id' },
        )
        if (error) console.warn('presence status was not saved', error.message)
      }
      if (event.name === 'room_entered' && typeof event.props.room_id === 'string') {
        const found = await supabase.from('rooms').select('id').eq('name', event.props.room_id).maybeSingle()
        const { error } = await supabase.from('presence').upsert(
          {
            user_id: event.user_id,
            room_id: found.data?.id ?? null,
            last_seen_at: event.ts,
          },
          { onConflict: 'user_id' },
        )
        if (error) console.warn('presence room was not saved', error.message)
      }
    } catch (error) {
      console.warn('presence update failed', error)
    }
  }
}
