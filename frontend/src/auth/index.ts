import { createDemoAuth } from './demoAuth'
import { createDevAuth } from './devAuth'
import { createSupabaseAuth } from './supabaseAuth'
import type { AuthProvider } from './types'

export function createAuthProvider(): AuthProvider {
  const which = (import.meta.env.VITE_AUTH_PROVIDER ?? 'dev').trim().toLowerCase()
  if (which === 'azure' || which === 'supabase') return createSupabaseAuth()
  if (which === 'demo') return createDemoAuth()
  return createDevAuth()
}

export type { AuthProvider, SessionUser, SignInInput } from './types'
