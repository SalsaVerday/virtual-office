import { describe, expect, it } from 'vitest'
import { qaHooksEnabled } from './enable'

describe('qaHooksEnabled', () => {
  it('never enables hooks in production, even when the flag is set', () => {
    expect(qaHooksEnabled({ MODE: 'production', VITE_QA_HOOKS: 'true' })).toBe(false)
    expect(qaHooksEnabled({ MODE: 'production' })).toBe(false)
  })

  it('enables hooks for the dev server and staging unless opted out', () => {
    expect(qaHooksEnabled({ MODE: 'development' })).toBe(true)
    expect(qaHooksEnabled({ MODE: 'staging' })).toBe(true)
    expect(qaHooksEnabled({ MODE: 'development', VITE_QA_HOOKS: 'true' })).toBe(true)
    expect(qaHooksEnabled({ MODE: 'development', VITE_QA_HOOKS: 'false' })).toBe(false)
    expect(qaHooksEnabled({ MODE: 'staging', VITE_QA_HOOKS: 'false' })).toBe(false)
  })
})
