export type ServerConfig = {
  livekitUrl: string
  apiKey: string
  apiSecret: string
  port: number
  frontendOrigins: string[]
}

// Published by `livekit-server --dev`. Local only; production rejects them.
const DEV_URL = 'ws://localhost:7880'
const DEV_KEY = 'devkey'
const DEV_SECRET = 'secret'

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProd = env.NODE_ENV === 'production'
  const livekitUrl = env.LIVEKIT_URL?.trim() || (isProd ? '' : DEV_URL)
  const apiKey = env.LIVEKIT_API_KEY?.trim() || (isProd ? '' : DEV_KEY)
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() || (isProd ? '' : DEV_SECRET)
  const port = Number(env.PORT ?? 3001)

  if (!livekitUrl || !apiKey || !apiSecret) {
    throw new Error('LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required in production')
  }
  if (isProd && (apiSecret === DEV_SECRET || apiSecret.length < 32)) {
    throw new Error('Refusing the LiveKit dev secret in production. Use a LiveKit Cloud key and secret.')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${env.PORT}`)
  }

  const frontendOrigins = (env.FRONTEND_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return { livekitUrl, apiKey, apiSecret, port, frontendOrigins }
}
