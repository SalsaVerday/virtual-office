import { expect, type Page } from '@playwright/test'

declare global {
  interface Window {
    __qa?: {
      ready?: boolean
      userId?: string
      sessionId?: string
      status?: string
      statusSource?: string
      position?: { x: number; y: number }
      zoneName?: string | null
      roomName?: string
      participants?: Array<{ identity: string; name: string; isLocal?: boolean; x: number | null; y: number | null; status?: string }>
      subscriptions?: Array<{ name: string; subscribed: boolean; gain: number; appliedGain: number | null }>
      knocks?: { targets: Array<{ identity: string }>; incoming: Array<{ identity: string }>; accepted: string[] }
      events?: Array<{ name: string; props: Record<string, unknown> }>
      exportEvents?: (format: 'json' | 'csv') => string
      teleport?: (x: number, y: number) => void
      worldToScreen?: (x: number, y: number) => { x: number; y: number }
    }
  }
}

export async function join(page: Page, room: string, name: string, variant: string) {
  await page.goto(`/?room=${encodeURIComponent(room)}`)
  await page.getByTestId('display-name').fill(name)
  await page.getByTestId('room-name').fill(room)
  await page.getByTestId(`variant-${variant}`).click()
  await page.getByTestId('join').click()
  await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 30_000 })
  if ((await page.getByTestId('mute').getAttribute('aria-pressed')) === 'true') {
    await page.getByTestId('mute').click()
  }
}

export async function teleport(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) => {
      window.__qa?.teleport(x, y)
    },
    { x, y },
  )
}

export async function waitGain(page: Page, name: string, min: number, max: number) {
  await page.waitForFunction(
    ({ name, min, max }) => {
      const sub = window.__qa?.subscriptions.find((entry) => entry.name === name)
      if (!sub) return false
      if (max <= 0.05 && !sub.subscribed) return true
      if (!sub.subscribed || sub.appliedGain == null) return false
      return sub.gain >= min && sub.gain <= max && sub.appliedGain >= min && sub.appliedGain <= max
    },
    { name, min, max },
    { timeout: 10_000 },
  )
}

export async function waitPeerStatus(page: Page, name: string, status: string) {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (peerName) => window.__qa?.participants.find((person) => person.name === peerName)?.status ?? null,
          name,
        ),
      { timeout: 10_000 },
    )
    .toBe(status)
}
