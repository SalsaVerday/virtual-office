import type { IncomingMessage, ServerResponse } from 'node:http'
import { frontendOrigins } from './config'
import { ApiError } from './errors'
import { tokenResult } from './tokenResult'

type WithBody = IncomingMessage & { body?: unknown }

function headerValue(headers: IncomingMessage['headers'], name: string): string | undefined {
  const value = headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value
}

async function readBody(req: WithBody): Promise<unknown> {
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8')) as unknown
    } catch {
      throw new ApiError('invalid JSON', 400)
    }
  }
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      return JSON.parse(req.body) as unknown
    } catch {
      throw new ApiError('invalid JSON', 400)
    }
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > 8_192) throw new ApiError('body too large', 413)
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new ApiError('invalid JSON', 400)
  }
}

function send(res: ServerResponse, status: number, json: Record<string, unknown>, extra: Record<string, string>): void {
  const payload = status === 204 ? '' : JSON.stringify(json)
  res.writeHead(status, {
    ...extra,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function corsHeaders(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  }
  if (!origin) return headers
  const allowed = frontendOrigins(env)
  if (allowed.includes('*') || allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers.Vary = 'Origin'
  }
  return headers
}

export async function handleToken(req: WithBody, res: ServerResponse, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const cors = corsHeaders(headerValue(req.headers, 'origin'), env)
  if (req.method === 'OPTIONS') {
    send(res, 204, {}, cors)
    return
  }
  try {
    const body = req.method === 'POST' ? await readBody(req) : {}
    const result = await tokenResult({
      method: req.method ?? 'GET',
      authorization: headerValue(req.headers, 'authorization'),
      body,
      env,
    })
    send(res, result.status, result.json, cors)
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500
    const message = error instanceof ApiError ? error.message : 'token service failed'
    if (!(error instanceof ApiError)) console.error(error)
    send(res, status, { error: message }, cors)
  }
}

export function handleHealth(req: IncomingMessage, res: ServerResponse, env: NodeJS.ProcessEnv = process.env): void {
  const cors = corsHeaders(headerValue(req.headers, 'origin'), env)
  if (req.method === 'OPTIONS') {
    send(res, 204, {}, cors)
    return
  }
  if (req.method !== 'GET') {
    send(res, 405, { error: 'method not allowed' }, cors)
    return
  }
  const configured = Boolean(env.LIVEKIT_URL?.trim() && env.LIVEKIT_API_KEY?.trim() && env.LIVEKIT_API_SECRET?.trim())
  send(res, 200, { ok: true, livekitConfigured: configured }, cors)
}
