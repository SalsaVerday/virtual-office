import { expect, test } from '@playwright/test'
import { join, teleport, waitGain, waitPeerStatus } from './helpers'

test('focus blocks audio both ways until a knock is accepted', async ({ browser }) => {
  test.setTimeout(90_000)
  const room = `qa-focus-${Date.now()}`
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ permissions: ['microphone'] })))
  const [ada, grace] = await Promise.all(contexts.map(async (context) => context.newPage()))

  await Promise.all([join(ada, room, 'Ada', 'v00'), join(grace, room, 'Grace', 'v03')])
  await teleport(ada, 720, 496)
  await teleport(grace, 784, 496)
  await waitGain(ada, 'Grace', 0.9, 1)
  await waitGain(grace, 'Ada', 0.9, 1)

  await grace.getByTestId('status-focus').click()
  await expect(grace.getByTestId('status-focus')).toHaveAttribute('aria-pressed', 'true')
  await expect(grace.getByTestId('status-icon')).toBeVisible()
  await expect.poll(async () => grace.evaluate(() => window.__qa?.status)).toBe('focus')
  await expect.poll(async () => grace.evaluate(() => window.__qa?.statusSource)).toBe('manual')
  await waitPeerStatus(ada, 'Grace', 'focus')

  await waitGain(ada, 'Grace', 0, 0.02)
  await waitGain(grace, 'Ada', 0, 0.02)
  await expect(ada.getByTestId('knock-prompt')).toBeVisible()
  await expect(ada.getByTestId('knock-icon')).toBeVisible()
  await expect(grace.getByTestId('knock-prompt')).toHaveCount(0)

  await ada.screenshot({ path: 'test-results/knock-prompt.png' })
  await ada.getByTestId('knock').click()
  await expect(grace.getByTestId('incoming-knock')).toBeVisible()
  await grace.screenshot({ path: 'test-results/knock-incoming.png' })
  await grace.getByTestId('knock-ignore').click()
  await expect(grace.getByTestId('incoming-knock')).toHaveCount(0)
  await waitGain(ada, 'Grace', 0, 0.02)
  await waitGain(grace, 'Ada', 0, 0.02)
  await expect
    .poll(async () =>
      grace.evaluate(() => window.__qa?.events.some((event) => event.name === 'knock_answered' && event.props.accepted === false)),
    )
    .toBe(true)

  await ada.getByTestId('knock').click()
  await expect(grace.getByTestId('knock-accept')).toBeVisible()
  await grace.getByTestId('knock-accept').click()
  await waitGain(ada, 'Grace', 0.9, 1)
  await waitGain(grace, 'Ada', 0.9, 1)
  await expect(ada.getByTestId('knock-prompt')).toHaveCount(0)
  await expect
    .poll(async () => ada.evaluate(() => window.__qa?.events.some((event) => event.name === 'knock_sent')))
    .toBe(true)
  await expect
    .poll(async () =>
      grace.evaluate(() => window.__qa?.events.some((event) => event.name === 'knock_answered' && event.props.accepted === true)),
    )
    .toBe(true)
  await expect.poll(async () => ada.evaluate(() => (window.__qa?.knocks?.accepted.length ?? 0) > 0)).toBe(true)

  await grace.screenshot({ path: 'test-results/status-icons.png' })
  await Promise.all(contexts.map(async (context) => context.close()))
})
