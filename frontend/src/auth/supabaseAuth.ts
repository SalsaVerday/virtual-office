import { sanitizeVariant } from '../config'
import type { AuthProvider, SessionUser } from './types'

const VARIANT_KEY = 'vo.variant'

/**
 * Microsoft Entra ID (Azure AD) through Supabase Auth's Azure provider.
 * Selected with VITE_AUTH_PROVIDER=supabase once VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set in the host environment (never in git).
 *
 * The Supabase project needs the Azure provider enabled and this site's
 * origin on the redirect allow-list. The anon key is public by design;
 * the Azure client secret stays in Supabase, not in this repo.
 */
export function createSupabaseAuth(): AuthProvider {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  async function client() {
    if (!url || !anonKey) {
      throw new Error('Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }
    const { createClient } = await import('@supabase/supabase-js')
    return createClient(url, anonKey)
  }

  return {
    id: 'supabase',
    async getSession() {
      if (!url || !anonKey) return null
      const supabase = await client()
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) return null
      const meta = user.user_metadata as { full_name?: string; name?: string }
      const displayName = meta.full_name || meta.name || user.email || 'Teammate'
      let variant = 'v00'
      try {
        variant = sanitizeVariant(localStorage.getItem(VARIANT_KEY))
      } catch {
        variant = 'v00'
      }
      return { userId: user.id, displayName, variant, provider: 'supabase' }
    },
    async signIn(input) {
      localStorage.setItem(VARIANT_KEY, sanitizeVariant(input.variant))
      const supabase = await client()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          scopes: 'email profile openid',
          redirectTo: window.location.origin,
        },
      })
      if (error) throw error
      // The browser leaves this page for Microsoft. The promise usually never settles.
      return new Promise<SessionUser>(() => {})
    },
    async signOut() {
      if (!url || !anonKey) return
      const supabase = await client()
      await supabase.auth.signOut()
    },
  }
}
