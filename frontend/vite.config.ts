import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build, type Plugin as EsbuildPlugin } from 'esbuild'
import react from '@vitejs/plugin-react'
import { loadEnv, type Connect, type Plugin, type ViteDevServer } from 'vite'
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

type ApiModule = {
  handleToken: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  handleHealth: (req: IncomingMessage, res: ServerResponse) => void
}

type ApiHost = {
  config: { mode: string; root: string }
  middlewares: Connect.Server
  ssrLoadModule?: (id: string) => Promise<ApiModule>
}

/** Preview bundles the API with esbuild, which does not map `.js` specifiers onto `.ts`. */
function resolveApiJsSpecifier(): EsbuildPlugin {
  return {
    name: 'resolve-api-js-specifier',
    setup(build) {
      build.onResolve({ filter: /^\./ }, (args) => {
        if (!args.path.endsWith('.js')) return undefined
        const stem = path.resolve(path.dirname(args.importer), args.path.slice(0, -3))
        for (const ext of ['.ts', '.tsx', '.mts']) {
          const file = stem + ext
          if (existsSync(file)) return { path: file }
        }
        return undefined
      })
    },
  }
}

async function loadApiModule(server: ApiHost): Promise<ApiModule> {
  if (server.ssrLoadModule) return server.ssrLoadModule('/api/lib/http.ts')
  const cacheDir = path.join(server.config.root, 'node_modules/.cache')
  mkdirSync(cacheDir, { recursive: true })
  const outfile = path.join(cacheDir, 'preview-api.mjs')
  await build({
    entryPoints: [path.join(server.config.root, 'api/lib/http.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    packages: 'external',
    plugins: [resolveApiJsSpecifier()],
  })
  return import(pathToFileURL(outfile).href) as Promise<ApiModule>
}

function attachApi(server: ApiHost): void {
  applyServerEnv(server.config.mode, server.config.root)
  let loading: Promise<ApiModule> | null = null
  server.middlewares.use(async (req, res, next) => {
    const urlPath = (req.url ?? '').split('?')[0].replace(/\/$/, '') || '/'
    if (urlPath !== '/api/token' && urlPath !== '/api/health') {
      next()
      return
    }
    try {
      loading ??= loadApiModule(server)
      const mod = await loading
      if (urlPath === '/api/health') mod.handleHealth(req, res)
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
    config(_config, env) {
      const loaded = loadEnv(env.mode, process.cwd(), 'VITE_')
      const leaked = loaded.VITE_DEMO_PASSCODE?.trim() || process.env.VITE_DEMO_PASSCODE?.trim()
      if (leaked) {
        throw new Error('VITE_DEMO_PASSCODE must not be set. The passcode is server-only (DEMO_PASSCODE).')
      }
    },
    configureServer(server) {
      attachApi(server)
    },
    configurePreviewServer(server) {
      attachApi(server as unknown as ViteDevServer)
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
    include: ['src/**/*.test.ts', 'api/**/*.test.ts', 'load/**/*.test.ts'],
  },
})
