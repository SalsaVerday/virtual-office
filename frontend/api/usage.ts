import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleUsage } from './lib/http.js'

/** Vercel Node.js function. Writes usage rows with the service role. */
export default function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  return handleUsage(req, res)
}
