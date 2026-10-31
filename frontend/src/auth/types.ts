export type AuthProviderId = 'dev' | 'azure'

export type SessionUser = {
  userId: string
  displayName: string
  variant: string
  provider: AuthProviderId
  /** Supabase access token. Present only for the Azure provider. The token route verifies it. */
  accessToken?: string
}

export type SignInInput = {
  displayName: string
  variant: string
}

/**
 * Swappable sign-in. `VITE_AUTH_PROVIDER=dev` (the default) is name entry.
 * `VITE_AUTH_PROVIDER=azure` is Microsoft Entra ID through Supabase Auth.
 * See docs/auth-plan.md.
 */
export interface AuthProvider {
  readonly id: AuthProviderId
  getSession(): Promise<SessionUser | null>
  signIn(input: SignInInput): Promise<SessionUser>
  signOut(): Promise<void>
}
