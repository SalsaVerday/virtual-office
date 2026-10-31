import { expect, test } from '@playwright/test'

test('the microphone stays unpublished until the user turns it on', async ({ page }) => {
  const room = `mic-${Date.now().toString(36)}`
  await page.goto(`/?room=${encodeURIComponent(room)}`)
  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('room-name').fill(room)
  await page.getByTestId('join').click()
  await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 30_000 })
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => page.evaluate(() => window.__qa?.localMic ?? null)).toEqual({
    enabled: false,
    published: false,
  })
  await page.getByTestId('mute').click()
  await expect(page.getByTestId('mute')).toHaveAttribute('aria-pressed', 'false')
  await expect
    .poll(async () => page.evaluate(() => window.__qa?.localMic?.published ?? false), { timeout: 15_000 })
    .toBe(true)
})
