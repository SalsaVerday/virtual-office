/** How long gain must stay at 0 before the microphone subscription is dropped. */
export const UNSUBSCRIBE_GRACE_MS = 750

export type AudioSubAction = 'subscribe' | 'unsubscribe' | 'hold'

/**
 * Subscribe as soon as someone is audible. After they leave range, hold the
 * current subscription through a short grace period so walking along the
 * cutoff does not subscribe and unsubscribe on every step.
 *
 * Call {@link AudioSubscriptionGate.decide} on each update. `hold` means
 * leave the LiveKit subscription as it is.
 */
export class AudioSubscriptionGate {
  private silentSince = new Map<string, number>()

  decide(identity: string, gain: number, now: number): AudioSubAction {
    if (gain > 0) {
      this.silentSince.delete(identity)
      return 'subscribe'
    }
    const since = this.silentSince.get(identity)
    if (since === undefined) {
      this.silentSince.set(identity, now)
      return 'hold'
    }
    if (now - since >= UNSUBSCRIBE_GRACE_MS) return 'unsubscribe'
    return 'hold'
  }

  forget(identity: string): void {
    this.silentSince.delete(identity)
  }

  clear(): void {
    this.silentSince.clear()
  }
}
