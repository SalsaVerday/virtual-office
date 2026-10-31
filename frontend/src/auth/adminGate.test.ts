import { describe, expect, it } from 'vitest'
import { canViewAdmin } from './adminGate'

describe('admin gate', () => {
  it('uses the dev flag until users.is_admin exists', () => {
    expect(canViewAdmin({ devFlag: false, isAdmin: null })).toBe(false)
    expect(canViewAdmin({ devFlag: true, isAdmin: null })).toBe(true)
  })

  it('follows users.is_admin once the profile is known', () => {
    expect(canViewAdmin({ devFlag: true, isAdmin: false })).toBe(false)
    expect(canViewAdmin({ devFlag: false, isAdmin: true })).toBe(true)
  })
})