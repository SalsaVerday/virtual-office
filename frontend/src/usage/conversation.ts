/** Analytics should count a conversation only when duration_s >= this. Short ones are still recorded. */
export const CONVERSATION_COUNT_S = 30

export type ConversationNotice = {
  name: 'conversation_started' | 'conversation_ended'
  props: Record<string, unknown>
}

/**
 * A conversation is the local user plus at least one person in audio range.
 * Only the participant with the lowest id emits, so a pair is not double-counted
 * when both clients run this tracker. Duration is always recorded; `counts` is
 * true once it has lasted {@link CONVERSATION_COUNT_S} seconds.
 */
export class ConversationTracker {
  private active: {
    id: string
    participantIds: string[]
    roomId: string | null
    startedAt: number
  } | null = null

  constructor(private readonly localId: string) {}

  update(remoteIds: readonly string[], roomId: string | null, now: number): ConversationNotice[] {
    const participantIds = [...new Set([this.localId, ...remoteIds])].sort()
    if (participantIds.length < 2 || participantIds[0] !== this.localId) return this.finish(now)
    const id = participantIds.join('+')
    if (this.active && this.active.id === id && this.active.roomId === roomId) return []
    const notices = this.finish(now)
    this.active = { id, participantIds, roomId, startedAt: now }
    notices.push({
      name: 'conversation_started',
      props: {
        conversation_id: id,
        participant_ids: participantIds,
        room_id: roomId,
      },
    })
    return notices
  }

  finish(now: number): ConversationNotice[] {
    if (!this.active) return []
    const duration_s = Math.max(0, Math.floor((now - this.active.startedAt) / 1000))
    const notice: ConversationNotice = {
      name: 'conversation_ended',
      props: {
        conversation_id: this.active.id,
        participant_ids: this.active.participantIds,
        room_id: this.active.roomId,
        duration_s,
        counts: duration_s >= CONVERSATION_COUNT_S,
      },
    }
    this.active = null
    return [notice]
  }
}
