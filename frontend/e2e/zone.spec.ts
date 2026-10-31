import { expect, test } from '@playwright/test'

test('?zone=standup opens on the standup circle', async ({ page }) => {
  const room = `zone-${Date.now().toString(36)}`
  await page.goto(`/?zone=standup&entry=teams_tab&room=${encodeURIComponent(room)}`)
  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('room-name').fill(room)
  await page.getByTestId('join').click()
  await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 30_000 })
  await expect(page.getByTestId('zone-name')).toHaveText('Standup')
  const position = await page.evaluate(() => window.__qa?.position)
  expect(position && Math.hypot(position.x - 768, position.y - 512)).toBeLessThan(24)
  await page.screenshot({ path: 'test-results/standup-zone.png' })
})
