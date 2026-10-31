import { createHash, timingSafeEqual } from 'node:crypto'
import { ApiError } from './errors'

/** Stable code. No secret material. Returned when DEMO_PASSCODE is missing. */
export const DEMO_UNCONFIGURED = 'demo_passcode_unconfigured'
/** Stable code. Does not echo the guess. */
export const DEMO_REJECTED = 'bad_passcode'
/** Stable code after repeated wrong passcodes. */
export const DEMO_RATE_LIMITED = 'rate_limited'

const FAILURES_BEFORE_LIMIT = 5
const BASE_MS = 1_000
const MAX_MS = 60_000
const MAX_BUCKETS = 4_096

type Bucket = { failures: number; blockedUntil: number }

/**
 * Per server instance. A Vercel function does not share this map across
 * isolates, and a cold start clears it. It slows guessing on one instance.
 * The passcode is never stored here.
 */
const buckets = new Map<string, Bucket>()

export function resetDemoPasscodeLimiter(): void {
  buckets.clear()
}

/** SHA-256 both sides so the compare stays constant-time for any length. */
export function passcodesMatch(provided: string, expected: string): boolean {
  const actual = createHash('sha256').update(provided, 'utf8').digest()
  const want = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(actual, want)
}

function prune(now: number): void {
  if (buckets.size <= MAX_BUCKETS) return
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil <= now) buckets.delete(key)
    if (buckets.size <= MAX_BUCKETS / 2) return
  }
  while (buckets.size > MAX_BUCKETS / 2) {
    const oldest = buckets.keys().next().value
    if (oldest === undefined) return
    buckets.delete(oldest)
  }
}

/** Seconds the caller must wait, or 0 when a try is allowed. */
export function demoRetryAfterSeconds(key: string, now = Date.now()): number {
  const bucket = buckets.get(key)
  if (!bucket || bucket.blockedUntil <= now) return 0
  return Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000))
}

/**
 * Count a wrong passcode for `key`. Returns Retry-After seconds when this
 * attempt crosses the limit, otherwise 0. The guess is not retained.
 */
export function noteDemoPasscodeFailure(key: string, now = Date.now()): number {
  prune(now)
  const bucket = buckets.get(key) ?? { failures: 0, blockedUntil: 0 }
  bucket.failures += 1
  let retry = 0
  if (bucket.failures >= FAILURES_BEFORE_LIMIT) {
    const steps = bucket.failures - FAILURES_BEFORE_LIMIT
    const delay = Math.min(MAX_MS, BASE_MS * 2 ** Math.min(steps, 16))
    bucket.blockedUntil = now + delay
    retry = Math.max(1, Math.ceil(delay / 1000))
  }
  buckets.set(key, bucket)
  return retry
}

export function noteDemoPasscodeSuccess(key: string): void {
  buckets.delete(key)
}

/**
 * Fail closed when the demo passcode is unset. A wrong guess is 401.
 * Repeated wrong guesses on the same client key become 429.
 */
export function assertDemoPasscode(
  env: NodeJS.ProcessEnv,
  provided: unknown,
  clientKey: string,
  now = Date.now(),
): void {
  const expected = env.DEMO_PASSCODE?.trim() ?? ''
  if (!expected) throw new ApiError(DEMO_UNCONFIGURED, 503)

  const wait = demoRetryAfterSeconds(clientKey, now)
  if (wait > 0) throw new ApiError(DEMO_RATE_LIMITED, 429, { 'Retry-After': String(wait) })

  const guess = typeof provided === 'string' ? provided.trim() : ''
  if (!passcodesMatch(guess, expected)) {
    const retry = noteDemoPasscodeFailure(clientKey, now)
    if (retry > 0) throw new ApiError(DEMO_RATE_LIMITED, 429, { 'Retry-After': String(retry) })
    throw new ApiError(DEMO_REJECTED, 401)
  }
  noteDemoPasscodeSuccess(clientKey)
}
