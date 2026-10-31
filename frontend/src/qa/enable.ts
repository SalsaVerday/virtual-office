type QaEnv = {
  MODE?: string
  VITE_QA_HOOKS?: string
}

/**
 * Hooks exist only outside production. Production stays off even if
 * VITE_QA_HOOKS=true is set on the host. Set VITE_QA_HOOKS=false to disable
 * them in dev or staging.
 */
export function qaHooksEnabled(env: QaEnv = import.meta.env): boolean {
  if (env.MODE === 'production') return false
  if (env.VITE_QA_HOOKS === 'false') return false
  if (env.VITE_QA_HOOKS === 'true') return true
  return env.MODE === 'development' || env.MODE === 'staging'
}
