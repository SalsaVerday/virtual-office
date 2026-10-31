export type AuthProviderId = 'dev' | 'azure' | 'demo'

export type SessionUser = {
  userId: string
  displayName: string
  variant: string
  provider: AuthProviderId
  /** Supabase access token. Present only for the Azure provider. The token route verifies it. */
  accessToken?: string
  /**
   * Demo mode only. Held in memory so /api/token can check it. Never persisted,
   * never logged, and never read from a VITE_ variable.
   */
  passcode?: string
}

export type SignInInput = {
  displayName: string
  variant: string
  /** Demo mode. Sent only in the /api/token body. */
  passcode?: string
}

/**
 * Swappable sign-in. `VITE_AUTH_PROVIDER=dev` (the default) is name entry.
 * `VITE_AUTH_PROVIDER=demo` is name plus a shared passcode.
 * `VITE_AUTH_PROVIDER=azure` is Microsoft Entra ID through Supabase Auth.
 * See docs/auth-plan.md.
 */
export interface AuthProvider {
  readonly id: AuthProviderId
  getSession(): Promise<SessionUser | null>
  signIn(input: SignInInput): Promise<SessionUser>
  signOut(): Promise<void>
}
