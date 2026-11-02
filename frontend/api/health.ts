import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleHealth } from './_lib/http.js'

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  handleHealth(req, res)
}
