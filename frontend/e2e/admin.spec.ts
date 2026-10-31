import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const events = [
  { name: 'session_started', user_id: 'ada', session_id: 'ada-1', props: {}, ts: '2026-10-30T22:00:00.000Z' },
  {
    name: 'session_ended',
    user_id: 'ada',
    session_id: 'ada-1',
    props: { duration_s: 9000 },
    ts: '2026-10-31T00:30:00.000Z',
  },
  { name: 'session_started', user_id: 'linus', session_id: 'linus-1', props: {}, ts: '2026-10-30T18:00:00.000Z' },
  {
    name: 'session_ended',
    user_id: 'linus',
    session_id: 'linus-1',
    props: { duration_s: 600 },
    ts: '2026-10-30T18:10:00.000Z',
  },
  { name: 'session_started', user_id: 'grace', session_id: 'grace-1', props: {}, ts: '2026-10-31T15:00:00.000Z' },
  {
    name: 'session_ended',
    user_id: 'grace',
    session_id: 'grace-1',
    props: { duration_s: 1200 },
    ts: '2026-10-31T15:20:00.000Z',
  },
  {
    name: 'conversation_ended',
    user_id: 'ada',
    session_id: 'ada-1',
    props: { conversation_id: 'ada+linus', duration_s: 12, counts: false },
    ts: '2026-10-30T18:05:00.000Z',
  },
  {
    name: 'conversation_ended',
    user_id: 'ada',
    session_id: 'ada-1',
    props: { conversation_id: 'ada+grace', duration_s: 40, counts: true },
    ts: '2026-10-30T19:00:00.000Z',
  },
  {
    name: 'conversation_ended',
    user_id: 'ada',
    session_id: 'ada-1',
    props: { conversation_id: 'ada+grace', duration_s: 90, counts: true },
    ts: '2026-10-31T15:10:00.000Z',
  },
  {
    name: 'conversation_ended',
    user_id: 'grace',
    session_id: 'grace-1',
    props: { conversation_id: 'ada+grace', duration_s: 90, counts: true },
    ts: '2026-10-31T15:10:01.000Z',
  },
]

test('admin usage is off the public page and exports the local sink', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /admin/i })).toHaveCount(0)
  await expect(page.locator('a[href="/admin"]')).toHaveCount(0)

  await page.addInitScript((seed) => {
    localStorage.setItem('vo.events.v1', JSON.stringify(seed))
  }, events)
  await page.goto('/admin')
  await expect(page.getByTestId('admin-denied')).toHaveCount(0)
  await expect(page.getByTestId('dau-2026-10-30')).toHaveText('2')
  await expect(page.getByTestId('dau-2026-10-31')).toHaveText('2')
  await expect(page.getByTestId('presence-2026-10-30-ada')).toHaveText('2h 00m')
  await expect(page.getByTestId('presence-2026-10-31-ada')).toHaveText('30m')
  await expect(page.getByTestId('presence-2026-10-31-grace')).toHaveText('20m')
  await expect(page.getByTestId('conversations-2026-10-30')).toHaveText('1')
  await expect(page.getByTestId('conversations-2026-10-31')).toHaveText('1')

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-csv').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('office-usage.csv')
  const file = await download.path()
  expect(file).toBeTruthy()
  const text = await readFile(file!, 'utf8')
  expect(text).toContain('dau,2026-10-30,,2')
  expect(text).toContain('presence_s,2026-10-31,grace,1200')
  expect(text).toContain('conversations,2026-10-30,,1')
  expect(text).toContain('conversations,2026-10-31,,1')

  await page.screenshot({ path: 'test-results/admin-usage.png', fullPage: true })
})
