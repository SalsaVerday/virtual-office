import { createDevAuth } from './devAuth'
import { createSupabaseAuth } from './supabaseAuth'
import type { AuthProvider } from './types'

export function createAuthProvider(): AuthProvider {
  const which = import.meta.env.VITE_AUTH_PROVIDER ?? 'dev'
  if (which === 'supabase') return createSupabaseAuth()
  return createDevAuth()
}

export type { AuthProvider, SessionUser, SignInInput } from './types'
