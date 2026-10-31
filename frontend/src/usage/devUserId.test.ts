import { describe, expect, it } from 'vitest'
import { DEV_USAGE_NAMESPACE, demoUserId, usageUserId, uuidV5 } from './devUserId'

describe('dev usage uuid', () => {
  it('matches the RFC 4122 v5 vector for the DNS namespace', async () => {
    await expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).resolves.toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    )
  })

  it('derives a stable version-5 uuid from a dev identity', async () => {
    const first = await usageUserId('dev:ada')
    const second = await usageUserId('dev:ada')
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await usageUserId('dev:grace')).not.toBe(first)
    expect(await uuidV5('dev:ada', DEV_USAGE_NAMESPACE)).toBe(first)
  })

  it('derives a stable demo uuid from the display name', async () => {
    const id = await demoUserId('Ada')
    expect(id).toBe(await demoUserId(' ada '))
    expect(id).toBe(await usageUserId(id))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(await demoUserId('Grace')).not.toBe(id)
  })

  it('leaves an existing uuid unchanged', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await expect(usageUserId(id)).resolves.toBe(id)
  })
})
