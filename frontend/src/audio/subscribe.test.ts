import { describe, expect, it } from 'vitest'
import { AudioSubscriptionGate, UNSUBSCRIBE_GRACE_MS } from './subscribe'
import { subscribeAllFromSearch } from './subscribeMode'

describe('audio subscription gate', () => {
  it('subscribes while gain is above zero and unsubscribes only after the grace period', () => {
    const gate = new AudioSubscriptionGate()
    expect(gate.decide('ada', 1, 0)).toBe('subscribe')
    expect(gate.decide('ada', 0.2, 10)).toBe('subscribe')
    expect(gate.decide('ada', 0, 20)).toBe('hold')
    expect(gate.decide('ada', 0, 20 + UNSUBSCRIBE_GRACE_MS - 1)).toBe('hold')
    expect(gate.decide('ada', 0, 20 + UNSUBSCRIBE_GRACE_MS)).toBe('unsubscribe')
  })

  it('restarts the grace period when someone becomes audible again', () => {
    const gate = new AudioSubscriptionGate()
    expect(gate.decide('ada', 0, 0)).toBe('hold')
    expect(gate.decide('ada', 1, 100)).toBe('subscribe')
    expect(gate.decide('ada', 0, 150)).toBe('hold')
    expect(gate.decide('ada', 0, 150 + UNSUBSCRIBE_GRACE_MS - 1)).toBe('hold')
    expect(gate.decide('ada', 0, 150 + UNSUBSCRIBE_GRACE_MS)).toBe('unsubscribe')
  })

  it('forgets a participant so the next silence starts a new grace period', () => {
    const gate = new AudioSubscriptionGate()
    gate.decide('ada', 0, 0)
    gate.forget('ada')
    expect(gate.decide('ada', 0, UNSUBSCRIBE_GRACE_MS + 5)).toBe('hold')
  })
})

describe('subscribe=all flag', () => {
  it('is honored only when QA hooks are on', () => {
    expect(subscribeAllFromSearch('?room=office&subscribe=all', true)).toBe(true)
    expect(subscribeAllFromSearch('room=office&subscribe=all', true)).toBe(true)
    expect(subscribeAllFromSearch('?subscribe=all', false)).toBe(false)
    expect(subscribeAllFromSearch('?room=office', true)).toBe(false)
    expect(subscribeAllFromSearch('?subscribe=none', true)).toBe(false)
  })
})
