import { expect, test } from '@playwright/test'

/**
 * The demo server is the second Playwright webServer (port 5174).
 * DEMO_PASSCODE there is a local test fixture, not a pitch secret.
 */
const FIXTURE = 'demo-test-passcode'

test.use({ baseURL: 'http://127.0.0.1:5174' })

test('dev mode has no passcode field', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173/')
  await expect(page.getByTestId('display-name')).toBeVisible()
  await expect(page.getByTestId('passcode-input')).toHaveCount(0)
})

test('demo mode rejects a wrong passcode and mints a token for the right one', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('passcode-input')).toBeVisible()
  await expect(page.getByTestId('auth-provider')).toContainText(/demo sign-in/i)

  const wrong = 'wrong-passcode-not-the-fixture'
  const rejected = page.waitForResponse(
    (response) => response.url().includes('/api/token') && response.request().method() === 'POST',
  )
  await page.getByTestId('display-name').fill('Ada')
  await page.getByTestId('passcode-input').fill(wrong)
  await page.getByTestId('join').click()
  const denied = await rejected
  expect(denied.status()).toBe(401)
  const deniedBody = (await denied.json()) as { token?: string; error?: string }
  expect(deniedBody.token).toBeUndefined()
  expect(deniedBody.error).toBe('bad_passcode')
  expect(JSON.stringify(deniedBody)).not.toContain(wrong)
  expect(JSON.stringify(deniedBody)).not.toContain(FIXTURE)
  await expect(page.getByTestId('join-error')).toContainText(/passcode/i)
  await expect(page.getByTestId('join')).toBeVisible()

  const accepted = page.waitForResponse(
    (response) => response.url().includes('/api/token') && response.request().method() === 'POST',
  )
  await page.getByTestId('passcode-input').fill(FIXTURE)
  await page.getByTestId('join').click()
  const minted = await accepted
  expect(minted.status()).toBe(200)
  const mintedBody = (await minted.json()) as { token?: string }
  expect(mintedBody.token).toEqual(expect.any(String))
  expect(mintedBody.token?.length).toBeGreaterThan(20)
  expect(JSON.stringify(mintedBody)).not.toContain(FIXTURE)
})
