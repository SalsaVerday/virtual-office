import { describe, expect, it } from 'vitest'
import { reduceAway } from './autoAway'

const online = { status: 'online' as const, source: 'manual' as const }

describe('auto away', () => {
  it('moves online to away on idle or a hidden tab, and back when they return', () => {
    const away = reduceAway(online, 'idle')
    expect(away).toEqual({ status: 'away', source: 'idle' })
    expect(reduceAway(online, 'hidden')).toEqual({ status: 'away', source: 'idle' })
    expect(reduceAway(away, 'activity')).toEqual({ status: 'online', source: 'idle' })
    expect(reduceAway(away, 'visible')).toEqual({ status: 'online', source: 'idle' })
  })

  it('leaves focus and a manual away alone', () => {
    const focus = { status: 'focus' as const, source: 'manual' as const }
    const manual = { status: 'away' as const, source: 'manual' as const }
    expect(reduceAway(focus, 'idle')).toEqual(focus)
    expect(reduceAway(focus, 'hidden')).toEqual(focus)
    expect(reduceAway(focus, 'activity')).toEqual(focus)
    expect(reduceAway(manual, 'activity')).toEqual(manual)
    expect(reduceAway(manual, 'visible')).toEqual(manual)
    expect(reduceAway(manual, 'idle')).toEqual(manual)
  })
})
