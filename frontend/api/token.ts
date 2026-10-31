import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleToken } from './lib/http'

/** Vercel Node.js function. Same handler the Vite dev server calls. */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleToken(req, res)
}
