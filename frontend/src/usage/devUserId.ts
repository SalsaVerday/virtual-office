/**
 * Namespace for staging dev-login rows in `users` / `usage_events`.
 * UUIDv5 (RFC 4122) of the `dev:…` identity under this namespace.
 * Not a credential. The same identity always maps to the same uuid.
 */
export const DEV_USAGE_NAMESPACE = '3f1a9c2e-7b44-4e1a-9d60-1c8e5a0b7f22'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * LiveKit identity for AUTH_PROVIDER=demo. UUIDv5 of the display name under
 * DEV_USAGE_NAMESPACE, so usage_events.user_id is already a uuid.
 * The same name always maps to the same id. The passcode is not an input.
 */
export async function demoUserId(displayName: string): Promise<string> {
  const name = displayName.trim().replace(/\s+/g, ' ').slice(0, 24).toLowerCase()
  return uuidV5(`demo:${name}`, DEV_USAGE_NAMESPACE)
}

/** LiveKit identity stays `dev:…`. Usage rows use this uuid so they fit `users.id`. */
export async function usageUserId(identity: string): Promise<string> {
  if (UUID_RE.test(identity)) return identity.toLowerCase()
  if (identity.startsWith('dev:')) return uuidV5(identity, DEV_USAGE_NAMESPACE)
  return identity
}

/** RFC 4122 name-based uuid, SHA-1, version 5. */
export async function uuidV5(name: string, namespace: string): Promise<string> {
  const ns = uuidBytes(namespace)
  const named = new TextEncoder().encode(name)
  const data = new Uint8Array(ns.length + named.length)
  data.set(ns, 0)
  data.set(named, ns.length)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function uuidBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('namespace must be a uuid')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return bytes
}
