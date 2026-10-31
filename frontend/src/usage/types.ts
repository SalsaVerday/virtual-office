export type EntryKind = 'direct' | 'teams_tab' | 'teams_link'

export type SessionEndReason = 'close' | 'timeout' | 'error'

export type StatusSource = 'manual' | 'idle' | 'teams'

export type UsageEventName =
  | 'session_started'
  | 'session_ended'
  | 'join_attempted'
  | 'join_succeeded'
  | 'join_failed'
  | 'status_changed'
  | 'room_entered'
  | 'room_left'
  | 'conversation_started'
  | 'conversation_ended'
  | 'knock_sent'
  | 'knock_answered'
  | 'av_quality_sample'

export type UsageEvent = {
  name: UsageEventName
  user_id: string
  session_id: string
  props: Record<string, unknown>
  ts: string
}

export interface UsageSink {
  emit(event: UsageEvent): void
  /** Events currently in memory or localStorage. Synchronous, this browser only. */
  list(): UsageEvent[]
  /**
   * Events for the admin view. Local today. A Supabase-backed sink reads
   * `usage_events` and falls back to {@link list} when that read is empty or fails.
   */
  load(): Promise<UsageEvent[]>
  exportJson(): string
  exportCsv(): string
}
