import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 1400 } })

test('join screen shows the splash and the avatar picker', async ({ page }) => {
  await page.goto('/')
  const splash = page.locator('.splash')
  await expect(splash).toBeVisible()
  await expect(splash).toHaveAttribute('data-scale', '4')
  const image = await splash.evaluate((node) => getComputedStyle(node).backgroundImage)
  expect(image).toContain('join_splash@4x.png')
  await expect(page.getByRole('heading', { name: 'Join the floor' })).toBeVisible()
  await expect(page.getByTestId('join')).toBeVisible()
  await expect(page.getByTestId('avatar-picker')).toBeVisible()
  await expect(page.getByTestId('avatar-option-v00')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('avatar-option-v04').click()
  await expect(page.getByTestId('avatar-option-v04')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('variant-v04')).toBeVisible()
  await page.screenshot({ path: 'test-results/join-screen.png', fullPage: true })
})
