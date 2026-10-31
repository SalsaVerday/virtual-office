import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'

function applyServerEnv(mode: string, root: string): void {
  const fromFile = loadEnv(mode, root, '')
  for (const [key, value] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  if (mode === 'test') return
  if (!process.env.LIVEKIT_URL?.trim() || !process.env.LIVEKIT_API_KEY?.trim() || !process.env.LIVEKIT_API_SECRET?.trim()) {
    console.warn(
      '[api/token] LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are unset. /api/token will fail closed.',
    )
  }
}

function attachApi(server: ViteDevServer): void {
  applyServerEnv(server.config.mode, server.config.root)
  type ApiModule = {
    handleToken: (req: IncomingMessage, res: ServerResponse) => Promise<void>
    handleHealth: (req: IncomingMessage, res: ServerResponse) => void
  }
  let loading: Promise<ApiModule> | null = null
  server.middlewares.use(async (req, res, next) => {
    const path = (req.url ?? '').split('?')[0].replace(/\/$/, '') || '/'
    if (path !== '/api/token' && path !== '/api/health') {
      next()
      return
    }
    try {
      loading ??= server.ssrLoadModule('/api/lib/http.ts') as Promise<ApiModule>
      const mod = await loading
      if (path === '/api/health') mod.handleHealth(req, res)
      else await mod.handleToken(req, res)
    } catch (error) {
      loading = null
      console.error(error)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'token service failed' }))
    }
  })
}

function officeApi(): Plugin {
  return {
    name: 'office-api',
    configureServer(server) {
      attachApi(server)
    },
  }
}

export default defineConfig({
  plugins: [react(), officeApi()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
  },
})
