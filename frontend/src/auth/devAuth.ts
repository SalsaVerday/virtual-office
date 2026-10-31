import { sanitizeName, sanitizeVariant } from '../config'
import type { AuthProvider, SessionUser, SignInInput } from './types'

const STORAGE_KEY = 'vo.session'

function read(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionUser>
    if (!parsed.userId || !parsed.displayName || parsed.provider !== 'dev') return null
    return {
      userId: parsed.userId,
      displayName: parsed.displayName,
      variant: sanitizeVariant(parsed.variant),
      provider: 'dev',
    }
  } catch {
    return null
  }
}

/** Name entry for local dev and Playwright. Tests never go through Microsoft SSO. */
export function createDevAuth(): AuthProvider {
  return {
    id: 'dev',
    async getSession() {
      return read()
    },
    async signIn(input: SignInInput): Promise<SessionUser> {
      const existing = read()
      const user: SessionUser = {
        userId: existing?.userId ?? `dev:${crypto.randomUUID()}`,
        displayName: sanitizeName(input.displayName),
        variant: sanitizeVariant(input.variant),
        provider: 'dev',
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      return user
    },
    async signOut() {
      localStorage.removeItem(STORAGE_KEY)
    },
  }
}
