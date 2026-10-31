import { describe, expect, it } from 'vitest'
import { kbps, summarize } from './summarize'

describe('load summaries', () => {
  it('reports median and p95 from a small sample', () => {
    const summary = summarize([10, 20, 30, 40, 100])
    expect(summary).toMatchObject({ n: 5, min: 10, max: 100, p50: 30 })
    expect(summary?.p95).toBeGreaterThan(40)
    expect(summary?.mean).toBe(40)
  })

  it('turns a byte delta into kilobits per second', () => {
    expect(kbps(0, 1000, 1000)).toBe(8)
    expect(kbps(0, 0, 0)).toBeNull()
    expect(summarize([])).toBeNull()
  })
})