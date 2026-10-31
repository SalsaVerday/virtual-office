import { sanitizeName, sanitizeVariant } from '../config'
import { demoUserId } from '../usage/devUserId'
import type { AuthProvider, SessionUser, SignInInput } from './types'

const STORAGE_KEY = 'vo.session'

type StoredDemo = {
  userId: string
  displayName: string
  variant: string
  provider: 'demo'
}

function read(): StoredDemo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredDemo> & { passcode?: unknown }
    if (!parsed.userId || !parsed.displayName || parsed.provider !== 'demo') return null
    return {
      userId: parsed.userId,
      displayName: parsed.displayName,
      variant: sanitizeVariant(parsed.variant),
      provider: 'demo',
    }
  } catch {
    return null
  }
}

/**
 * Name plus a shared passcode. The passcode stays in memory for the token
 * request and is never written to localStorage. The server compares it.
 * This module does not read server environment variables.
 */
export function createDemoAuth(): AuthProvider {
  return {
    id: 'demo',
    async getSession() {
      const stored = read()
      if (!stored) return null
      return stored
    },
    async signIn(input: SignInInput): Promise<SessionUser> {
      const displayName = sanitizeName(input.displayName)
      const userId = await demoUserId(displayName)
      const stored: StoredDemo = {
        userId,
        displayName,
        variant: sanitizeVariant(input.variant),
        provider: 'demo',
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      return { ...stored, passcode: input.passcode?.trim() ?? '' }
    },
    async signOut() {
      localStorage.removeItem(STORAGE_KEY)
    },
  }
}
