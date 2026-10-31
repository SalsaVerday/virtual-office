import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { loadConfig } from './config.js'
import { issueToken, TokenError, type TokenRequest } from './token.js'

const config = loadConfig()

function originAllowed(origin: string | undefined): string | null {
  if (!origin) return null
  if (config.frontendOrigins.includes('*')) return origin
  return config.frontendOrigins.includes(origin) ? origin : null
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const allowed = originAllowed(req.headers.origin)
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', allowed)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '600')
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > 8_192) {
      throw new TokenError('body too large', 413)
    }
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new TokenError('invalid JSON', 400)
  }
}

const server = createServer(async (req, res) => {
  applyCors(req, res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
      sendJson(res, 200, { ok: true })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/token') {
      const body = (await readJson(req)) as TokenRequest
      sendJson(res, 200, await issueToken(config, body))
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (error) {
    if (error instanceof TokenError) {
      sendJson(res, error.status, { error: error.message })
      return
    }
    console.error(error)
    sendJson(res, 500, { error: 'token service failed' })
  }
})

server.listen(config.port, '0.0.0.0', () => {
  console.log(`token service on http://127.0.0.1:${config.port} -> ${config.livekitUrl}`)
})
