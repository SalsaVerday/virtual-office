import { ApiError } from './errors.js'

export type LiveKitConfig = {
  livekitUrl: string
  apiKey: string
  apiSecret: string
}

/** LiveKit's published `livekit-server --dev` secret. Not a cloud credential. */
export const DEV_SECRET = 'secret'

const REQUIRED = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] as const

/**
 * Vercel production, or a process with NODE_ENV=production and no Vercel env.
 * Preview (`VERCEL_ENV=preview`) is not production, so the staging dev-login
 * exception can apply there. The dev secret is still refused whenever
 * NODE_ENV or VERCEL_ENV is production. See loadLiveKitConfig.
 */
export function isVercelProduction(env: NodeJS.ProcessEnv): boolean {
  if (env.VERCEL_ENV === 'production') return true
  if (env.VERCEL_ENV === 'preview' || env.VERCEL_ENV === 'development') return false
  return env.NODE_ENV === 'production'
}

export function loadLiveKitConfig(env: NodeJS.ProcessEnv): LiveKitConfig {
  const livekitUrl = env.LIVEKIT_URL?.trim() ?? ''
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? ''
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? ''
  if (!livekitUrl || !apiKey || !apiSecret) {
    const missing = REQUIRED.filter((name) => !env[name]?.trim())
    throw new ApiError(
      `Missing ${missing.join(', ')}. /api/token will not mint a token until LiveKit is configured.`,
      503,
    )
  }
  // Refuse the dev secret on any production process, including Vercel preview
  // where NODE_ENV is production. A short secret is the same class of mistake.
  const productionProcess = env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production'
  if (productionProcess && (apiSecret === DEV_SECRET || apiSecret.length < 32)) {
    throw new ApiError('Refusing the LiveKit dev secret in production. Use a LiveKit Cloud key and secret.', 500)
  }
  return { livekitUrl, apiKey, apiSecret }
}

export function frontendOrigins(env: NodeJS.ProcessEnv): string[] {
  return (env.FRONTEND_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}
