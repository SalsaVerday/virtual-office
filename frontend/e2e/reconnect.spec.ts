import { expect, test } from '@playwright/test'
import { join, teleport } from './helpers'

test('a dropped network shows reconnecting and restores the spot', async ({ page }) => {
  test.setTimeout(90_000)
  const room = `re-${Date.now().toString(36)}`
  await join(page, room, 'Ada', 'v00')
  await teleport(page, 720, 496)
  await expect(page.getByTestId('zone-name')).toHaveText('Standup')
  await page.context().setOffline(true)
  await expect(page.getByTestId('connection-status')).toContainText(/Reconnecting|Offline/)
  await page.screenshot({ path: 'test-results/reconnecting.png' })
  await page.context().setOffline(false)
  await expect(page.getByTestId('connection-status')).toHaveCount(0, { timeout: 30_000 })
  const position = await page.evaluate(() => window.__qa?.position)
  expect(position && Math.hypot(position.x - 720, position.y - 496)).toBeLessThan(24)
  await expect(page.getByTestId('zone-name')).toHaveText('Standup')
  await expect(page.getByTestId('status-online')).toHaveAttribute('aria-pressed', 'true')
})
