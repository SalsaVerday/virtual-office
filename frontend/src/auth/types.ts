export type AuthProviderId = 'dev' | 'supabase'

export type SessionUser = {
  userId: string
  displayName: string
  variant: string
  provider: AuthProviderId
}

export type SignInInput = {
  displayName: string
  variant: string
}

/**
 * Swappable sign-in. Phase 1 uses {@link DevAuthProvider}.
 * Microsoft Entra ID arrives as {@link SupabaseAuthProvider} (Supabase Azure provider)
 * without changing the office or LiveKit call sites.
 */
export interface AuthProvider {
  readonly id: AuthProviderId
  getSession(): Promise<SessionUser | null>
  signIn(input: SignInInput): Promise<SessionUser>
  signOut(): Promise<void>
}
