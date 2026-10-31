import { expect, test, type Page } from '@playwright/test'
import { join, teleport } from './helpers'

async function names(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__qa?.events.map((event) => event.name) ?? [])
}

test('usage events land in the local sink', async ({ browser }) => {
  test.setTimeout(90_000)
  const room = `qa-events-${Date.now()}`
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ permissions: ['microphone'] })))
  const [ada, grace] = await Promise.all(contexts.map(async (context) => context.newPage()))

  await ada.goto('/?room=' + room + '&entry=direct')
  await join(ada, room, 'Ada', 'v00')
  await expect
    .poll(async () => names(ada), { timeout: 15_000 })
    .toEqual(expect.arrayContaining(['session_started', 'join_attempted', 'join_succeeded']))
  const started = await ada.evaluate(() => window.__qa?.events.find((event) => event.name === 'session_started')?.props)
  expect(started).toMatchObject({ entry: 'direct', session_id: expect.any(String), user_id: expect.stringMatching(/^dev:/) })
  expect(started?.browser).toBeTruthy()

  await ada.getByTestId('status-away').click()
  await expect
    .poll(
      async () =>
        ada.evaluate(
          () => window.__qa?.events.find((event) => event.name === 'status_changed' && event.props.to === 'away')?.props,
        ),
      { timeout: 10_000 },
    )
    .toMatchObject({ from: 'online', to: 'away', source: 'manual' })

  await teleport(ada, 200, 496)
  await expect
    .poll(
      async () =>
        ada.evaluate(() =>
          window.__qa?.events.some((event) => event.name === 'room_entered' && event.props.room_id === 'Lounge'),
        ),
      { timeout: 10_000 },
    )
    .toBe(true)

  const csv = await ada.evaluate(() => window.__qa?.exportEvents('csv') ?? '')
  expect(csv).toContain('session_started')
  expect(csv).toContain('status_changed')
  const json = await ada.evaluate(() => window.__qa?.exportEvents('json') ?? '[]')
  expect(JSON.parse(json).length).toBeGreaterThan(2)

  await join(grace, room, 'Grace', 'v01')
  await teleport(ada, 720, 496)
  await teleport(grace, 752, 496)
  await expect
    .poll(
      async () => {
        const [a, g] = await Promise.all([names(ada), names(grace)])
        return a.includes('conversation_started') || g.includes('conversation_started')
      },
      { timeout: 15_000 },
    )
    .toBe(true)

  await teleport(grace, 208, 496)
  await expect
    .poll(
      async () => {
        const ended = await Promise.all([
          ada.evaluate(() => window.__qa?.events.find((event) => event.name === 'conversation_ended')?.props ?? null),
          grace.evaluate(() => window.__qa?.events.find((event) => event.name === 'conversation_ended')?.props ?? null),
        ])
        return ended.find((props) => props && typeof props.duration_s === 'number') ?? null
      },
      { timeout: 15_000 },
    )
    .toMatchObject({ counts: false })

  await Promise.all(contexts.map(async (context) => context.close()))
})
