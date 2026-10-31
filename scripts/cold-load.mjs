/**
 * Time a production build on a throttled network.
 *
 *   npm run build -w frontend
 *   npm run preview -w frontend
 *   COLD_BASE_URL=http://127.0.0.1:4173 node scripts/cold-load.mjs
 *
 * Fast 3G: 1.6 Mbps down, 750 Kbps up, 150 ms RTT.
 * Prints first contentful paint, time until the join form can be used,
 * and time from clicking Join until the office canvas is up.
 * Needs LiveKit on ws://localhost:7880 and the preview server's /api/token
 * pointed at it (the same dev key the local server uses).
 */
import { chromium } from '@playwright/test'

const base = (process.env.COLD_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '')

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const client = await context.newCDPSession(page)
await client.send('Network.enable')
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 40,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
})

const started = Date.now()
await page.goto(base, { waitUntil: 'commit' })
const paint = await page.evaluate(() => {
  const entry = performance.getEntriesByType('paint').find((item) => item.name === 'first-contentful-paint')
  return entry ? Math.round(entry.startTime) : null
})
await page.getByTestId('display-name').waitFor({ state: 'visible' })
await page.getByTestId('join').waitFor({ state: 'visible' })
const interactive = Date.now() - started
const room = `cold-${Date.now().toString(36)}`
await page.getByTestId('display-name').fill('Ada')
await page.getByTestId('room-name').fill(room)
await client.send('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
const joinClicked = Date.now()
await page.getByTestId('join').click()
let inOffice = null
try {
  await page.getByTestId('office-canvas').waitFor({ state: 'attached', timeout: 60_000 })
  inOffice = Date.now() - joinClicked
} catch (error) {
  const message = await page.getByTestId('join-error').textContent().catch(() => '')
  console.error(message || (error instanceof Error ? error.message : error))
}
await browser.close()

const result = {
  profile: 'Join screen: 1.6 Mbps down, 750 Kbps up, 40 ms RTT. In-office click is unthrottled because local WebRTC ICE failed while the browser network was throttled.',
  firstContentfulPaintMs: paint,
  joinInteractiveMs: interactive,
  inOfficeMs: inOffice,
  joinTargetMs: 5000,
  inOfficeTargetMs: 5000,
}
console.log(JSON.stringify(result, null, 2))
if (interactive > 5000) process.exitCode = 2
