import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleHealth } from './lib/http'

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  handleHealth(req, res)
}
