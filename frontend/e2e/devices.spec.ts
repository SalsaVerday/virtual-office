import { expect, test } from '@playwright/test'
import { join } from './helpers'

test('microphone and speaker choices are in settings and persist', async ({ page }) => {
  const room = `dev-${Date.now().toString(36)}`
  await join(page, room, 'Ada', 'v00')
  await page.getByTestId('settings').click()
  await expect(page.getByTestId('settings-panel')).toBeVisible()
  const mic = page.getByTestId('mic-device')
  const speaker = page.getByTestId('speaker-device')
  await expect(mic).toBeVisible()
  await expect(speaker).toBeVisible()
  const micValue = await mic.locator('option').nth(1).getAttribute('value')
  const speakerValue = await speaker.locator('option').nth(1).getAttribute('value')
  if (micValue) await mic.selectOption(micValue)
  if (speakerValue) await speaker.selectOption(speakerValue)
  const stored = await page.evaluate(() => localStorage.getItem('vo.devices'))
  const parsed = JSON.parse(stored || '{}') as { micId?: string; speakerId?: string }
  if (micValue) expect(parsed.micId).toBe(micValue)
  if (speakerValue) expect(parsed.speakerId).toBe(speakerValue)
  await page.screenshot({ path: 'test-results/settings-devices.png' })
  await page.reload()
  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('room-name').fill(room)
  await page.getByTestId('join').click()
  await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 30_000 })
  await page.getByTestId('settings').click()
  if (micValue) await expect(page.getByTestId('mic-device')).toHaveValue(micValue)
  if (speakerValue) await expect(page.getByTestId('speaker-device')).toHaveValue(speakerValue)
})
