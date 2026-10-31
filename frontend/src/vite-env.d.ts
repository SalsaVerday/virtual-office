/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOKEN_URL?: string
  readonly VITE_AUTH_PROVIDER?: string
  readonly VITE_QA_HOOKS?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
