import type { UsageEvent } from './types'

const BATCH = 20
const FLUSH_MS = 400

/**
 * Batches events to `/api/usage`. The LiveKit token is the credential.
 * `user_id` is not sent. A 503 `usage_unconfigured` turns the writer off
 * without disturbing the local sink.
 */
export class UsageApiSink {
  private queue: UsageEvent[] = []
  private token: string | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private sending = false
  private stopped = false
  private probe: Promise<void> | null = null
  private delayMs = FLUSH_MS
  private warned = false

  authorize(livekitToken: string): void {
    const token = livekitToken.trim()
    if (!token || this.stopped) return
    this.token = token
    this.probe ??= this.readHealth()
    void this.probe.then(() => this.kick())
  }

  /** Skip the POST when health says the server has no service role key. */
  private async readHealth(): Promise<void> {
    try {
      const health = await fetch('/api/health')
      if (!health.ok) return
      const body = (await health.json()) as { usageConfigured?: boolean }
      if (body.usageConfigured === false) {
        this.stopped = true
        this.queue = []
      }
    } catch {
      // A failed health check still lets the POST try once.
    }
  }

  persist(event: UsageEvent): void {
    if (this.stopped) return
    this.queue.push(event)
    if (this.queue.length > 200) this.queue.splice(0, this.queue.length - 200)
    this.kick()
  }

  private kick(): void {
    if (!this.token || this.stopped || this.timer || this.sending || this.queue.length === 0) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.delayMs)
  }

  private async flush(): Promise<void> {
    if (!this.token || this.stopped || this.sending || this.queue.length === 0) return
    this.sending = true
    const batch = this.queue.slice(0, BATCH)
    try {
      const response = await fetch('/api/usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          events: batch.map((event) => ({
            name: event.name,
            session_id: event.session_id,
            props: event.props,
            ts: event.ts,
          })),
        }),
      })
      if (response.status === 503) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        if (body.error === 'usage_unconfigured') {
          this.stopped = true
          this.queue = []
          return
        }
      }
      if (response.status === 429) {
        this.delayMs = Math.min(30_000, this.delayMs * 2)
        return
      }
      if (!response.ok) {
        this.stopped = true
        if (!this.warned) {
          this.warned = true
          console.warn('Usage events stayed in the local sink')
        }
        return
      }
      this.queue.splice(0, batch.length)
      this.delayMs = FLUSH_MS
    } catch {
      this.stopped = true
      if (!this.warned) {
        this.warned = true
        console.warn('Usage events stayed in the local sink')
      }
    } finally {
      this.sending = false
      if (!this.stopped && this.queue.length > 0) this.kick()
    }
  }
}
