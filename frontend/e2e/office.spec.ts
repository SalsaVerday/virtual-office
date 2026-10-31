import { expect, test, type Page } from '@playwright/test'

type QaSubscription = {
  identity: string
  name: string
  subscribed: boolean
  gain: number
  appliedGain: number | null
}

declare global {
  interface Window {
    __qa?: {
      ready: true
      userId: string
      position: { x: number; y: number }
      zoneName: string | null
      roomName: string
      participants: Array<{ identity: string; name: string; isLocal: boolean; x: number | null; y: number | null }>
      subscriptions: QaSubscription[]
      teleport: (x: number, y: number) => void
      worldToScreen: (x: number, y: number) => { x: number; y: number }
    }
  }
}

async function join(page: Page, room: string, name: string, variant: string) {
  await page.goto(`/?room=${encodeURIComponent(room)}`)
  await page.getByTestId('display-name').fill(name)
  await page.getByTestId('room-name').fill(room)
  await page.getByTestId(`variant-${variant}`).click()
  await page.getByTestId('join').click()
  await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 30_000 })
}

async function teleport(page: Page, x: number, y: number) {
  await page.evaluate(
    ({ x, y }) => {
      window.__qa?.teleport(x, y)
    },
    { x, y },
  )
}

async function waitCentered(page: Page, x: number, y: number) {
  await page.waitForFunction(
    ({ x, y }) => {
      const position = window.__qa?.position
      if (!position) return false
      if (Math.hypot(position.x - x, position.y - y) > 12) return false
      const screen = window.__qa!.worldToScreen(position.x, position.y)
      const rect = document.querySelector('canvas')?.getBoundingClientRect()
      if (!rect) return false
      return (
        Math.abs(screen.x - (rect.left + rect.width / 2)) < 64 &&
        Math.abs(screen.y - (rect.top + rect.height / 2)) < 64
      )
    },
    { x, y },
  )
}

async function waitNear(page: Page, name: string, x: number, y: number) {
  await page.waitForFunction(
    ({ name, x, y }) => {
      const peer = window.__qa?.participants.find((person) => person.name === name)
      if (peer?.x == null || peer.y == null) return false
      return Math.hypot(peer.x - x, peer.y - y) < 24
    },
    { name, x, y },
  )
}

async function waitGain(page: Page, name: string, min: number, max: number) {
  await page.waitForFunction(
    ({ name, min, max }) => {
      const sub = window.__qa?.subscriptions.find((entry) => entry.name === name)
      if (!sub?.subscribed || sub.appliedGain == null) return false
      return sub.gain >= min && sub.gain <= max && sub.appliedGain >= min && sub.appliedGain <= max
    },
    { name, min, max },
    { timeout: 10_000 },
  )
}

test('three clients sync movement, proximity gain, and meeting privacy', async ({ browser }) => {
  test.setTimeout(120_000)
  const room = `qa-${Date.now()}`
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ permissions: ['microphone'] })))
  const pages = await Promise.all(contexts.map(async (context) => context.newPage()))
  const [ada, grace, linus] = pages
  const artErrors: string[] = []
  for (const page of pages) {
    page.on('pageerror', (error) => artErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (/tileset|texture|failed to load|Art failed|missing tile|missing object/i.test(text)) {
        artErrors.push(text)
      }
    })
  }

  await Promise.all([
    join(ada, room, 'Ada', 'v00'),
    join(grace, room, 'Grace', 'v01'),
    join(linus, room, 'Linus', 'v02'),
  ])

  expect(artErrors, artErrors.join('\n')).toEqual([])
  await expect(ada.getByTestId('current-room')).toHaveText(room)
  await expect(ada.getByTestId('auth-provider')).toHaveCount(0)

  for (const page of pages) {
    await page.waitForFunction(
      () => (window.__qa?.participants.length ?? 0) >= 3 && window.__qa?.participants.every((person) => person.x != null),
      null,
      { timeout: 15_000 },
    )
    await page.waitForFunction(
      () => window.__qa?.subscriptions.filter((sub) => sub.subscribed).length === 2,
      null,
      { timeout: 15_000 },
    )
  }

  const userId = await ada.evaluate(() => window.__qa?.userId ?? '')
  expect(userId.startsWith('dev:')).toBe(true)

  await ada.waitForFunction(() => {
    const position = window.__qa?.position
    if (!position) return false
    const screen = window.__qa!.worldToScreen(position.x, position.y)
    const rect = document.querySelector('canvas')?.getBoundingClientRect()
    if (!rect) return false
    return Math.abs(screen.x - (rect.left + rect.width / 2)) < 90
  })
  const feet = await ada.evaluate(() => window.__qa!.worldToScreen(window.__qa!.position.x, window.__qa!.position.y))
  await ada.mouse.click(feet.x, feet.y)
  const originX = await ada.evaluate(() => window.__qa!.position.x)
  await ada.keyboard.down('d')
  await ada.waitForFunction((startX) => (window.__qa?.position.x ?? 0) > startX + 36, originX)
  await ada.keyboard.up('d')
  const afterKeys = await ada.evaluate(() => ({ ...window.__qa!.position }))
  await grace.waitForFunction(
    (target) => {
      const adaPeer = window.__qa?.participants.find((person) => person.name === 'Ada')
      if (adaPeer?.x == null) return false
      return Math.abs(adaPeer.x - target) < 36
    },
    afterKeys.x,
  )

  const clickTarget = { x: afterKeys.x + 96, y: afterKeys.y }
  const screen = await ada.evaluate((point) => window.__qa!.worldToScreen(point.x, point.y), clickTarget)
  await ada.mouse.click(screen.x, screen.y)
  await ada.waitForFunction(
    (point) => {
      const position = window.__qa?.position
      if (!position) return false
      return Math.hypot(position.x - point.x, position.y - point.y) < 20
    },
    clickTarget,
  )
  await linus.waitForFunction(
    (point) => {
      const adaPeer = window.__qa?.participants.find((person) => person.name === 'Ada')
      if (adaPeer?.x == null || adaPeer.y == null) return false
      return Math.hypot(adaPeer.x - point.x, adaPeer.y - point.y) < 36
    },
    clickTarget,
  )

  await teleport(ada, 720, 496)
  await teleport(grace, 784, 496)
  await expect.poll(async () => ada.evaluate(() => window.__qa?.zoneName)).toBe('Standup')
  await waitGain(ada, 'Grace', 0.9, 1)
  await waitGain(grace, 'Ada', 0.9, 1)

  await teleport(grace, 912, 496)
  await waitGain(ada, 'Grace', 0.35, 0.65)

  await teleport(grace, 208, 496)
  await waitGain(ada, 'Grace', 0, 0.05)

  await teleport(ada, 1232, 720)
  await teleport(grace, 1296, 720)
  await expect.poll(async () => ada.evaluate(() => window.__qa?.zoneName)).toBe('Meeting 1')
  await expect.poll(async () => grace.evaluate(() => window.__qa?.zoneName)).toBe('Meeting 2')
  await waitGain(ada, 'Grace', 0, 0.02)
  await waitGain(grace, 'Ada', 0, 0.02)

  await teleport(ada, 1072, 688)
  await teleport(grace, 1232, 912)
  await waitGain(ada, 'Grace', 0.95, 1)
  await waitGain(grace, 'Ada', 0.95, 1)

  await teleport(linus, 1360, 720)
  await waitGain(grace, 'Linus', 0, 0.02)
  await waitGain(linus, 'Grace', 0, 0.02)
  await teleport(grace, 1360, 752)
  await waitGain(linus, 'Grace', 0.95, 1)
  await waitGain(ada, 'Linus', 0, 0.02)

  await teleport(ada, 720, 496)
  await teleport(grace, 784, 496)
  await waitGain(ada, 'Grace', 0.9, 1)
  await grace.getByTestId('status-focus').click()
  await expect(grace.getByTestId('status-focus')).toHaveAttribute('aria-pressed', 'true')
  await waitGain(ada, 'Grace', 0, 0.02)
  await expect(ada.getByTestId('knock')).toBeVisible()
  await ada.getByTestId('knock').click()
  await expect(grace.getByTestId('knock-accept')).toBeVisible()
  await grace.getByTestId('knock-accept').click()
  await waitGain(ada, 'Grace', 0.9, 1)

  await grace.getByTestId('status-online').click()
  await teleport(ada, 1136, 720)
  await teleport(grace, 1168, 720)
  await waitCentered(ada, 1136, 720)
  await waitNear(ada, 'Grace', 1168, 720)
  await ada.screenshot({ path: 'test-results/office-meeting.png' })

  await teleport(ada, 720, 496)
  await teleport(grace, 784, 496)
  await teleport(linus, 848, 496)
  await waitCentered(ada, 720, 496)
  await waitNear(ada, 'Grace', 784, 496)
  await waitNear(ada, 'Linus', 848, 496)
  await ada.screenshot({ path: 'test-results/office-three-avatars.png' })

  expect(artErrors, artErrors.join('\n')).toEqual([])
  await Promise.all(contexts.map(async (context) => context.close()))
})
