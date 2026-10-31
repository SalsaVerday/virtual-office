import { describe, expect, it } from 'vitest'
import { sanitizeName, sanitizeRoom, sanitizeVariant } from './config'

describe('join input', () => {
  it('rejects room names that are not link-safe', () => {
    expect(sanitizeRoom('')).toBe('office')
    expect(sanitizeRoom('squad-a')).toBe('squad-a')
    expect(() => sanitizeRoom('has space')).toThrow(/Room names/)
  })

  it('keeps avatar variants inside the art pack', () => {
    expect(sanitizeVariant('v00')).toBe('v00')
    expect(sanitizeVariant('v29')).toBe('v29')
    expect(sanitizeVariant('v30')).toBe('v00')
    expect(sanitizeVariant('nope')).toBe('v00')
  })

  it('trims display names', () => {
    expect(sanitizeName('  Ada  Lovelace ')).toBe('Ada Lovelace')
    expect(() => sanitizeName('   ')).toThrow(/name/)
  })
})
