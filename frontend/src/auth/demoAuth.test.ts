import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoAuth } from './demoAuth'
import { demoUserId } from '../usage/devUserId'

function memoryStorage() {
  const bag = new Map<string, string>()
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value)
    },
    removeItem: (key: string) => {
      bag.delete(key)
    },
    dump: () => [...bag.values()].join('\n'),
  }
}

describe('demo auth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores the uuid and name, and keeps the passcode out of storage', async () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    const passcode = 'not-stored-passcode'
    const auth = createDemoAuth()
    const user = await auth.signIn({ displayName: 'Ada', variant: 'v01', passcode })
    expect(user.userId).toBe(await demoUserId('Ada'))
    expect(user.provider).toBe('demo')
    expect(user.passcode).toBe(passcode)
    expect(storage.dump()).not.toContain(passcode)
    const saved = JSON.parse(storage.getItem('vo.session') ?? '{}') as { passcode?: string; userId?: string }
    expect(saved.passcode).toBeUndefined()
    expect(saved.userId).toBe(user.userId)
    const restored = await auth.getSession()
    expect(restored?.userId).toBe(user.userId)
    expect(restored?.passcode).toBeUndefined()
  })
})
