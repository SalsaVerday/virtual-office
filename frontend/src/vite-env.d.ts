/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_URL?: string
  readonly VITE_AUTH_PROVIDER?: string
  readonly VITE_QA_HOOKS?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Milliseconds without input before auto-away. Default 180000. Dev and staging only matter at runtime. */
  readonly VITE_IDLE_MS?: string
  /** Milliseconds a hidden tab waits before auto-away. Default 20000. */
  readonly VITE_HIDDEN_MS?: string
  /** Dev stand-in for users.is_admin. Opens /admin. Not a link in the office HUD. */
  readonly VITE_ADMIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
