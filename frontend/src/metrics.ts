/**
 * Seam for later usage metrics (daily sessions, time present, proximity conversations).
 * Phase 1 records nothing. Swap the sink when Supabase lands.
 */
export type UsageEvent =
  | { type: 'session-started'; userId: string; room: string; at: number }
  | { type: 'presence'; userId: string; room: string; seconds: number }
  | { type: 'proximity-conversation'; userId: string; peerId: string; room: string }

export interface UsageSink {
  record(event: UsageEvent): void
}

export const noopUsage: UsageSink = {
  record() {},
}
