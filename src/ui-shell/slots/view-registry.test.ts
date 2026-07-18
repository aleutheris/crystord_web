import { describe, it, expect } from 'vitest'
import { initialActiveView } from './view-registry'

// ADR-260065 / Q3: homeEmphasis drives the landing view — compute → Flow, relationship →
// Network — falling back to the first enabled view, then Flow.
describe('initialActiveView', () => {
  const ALL = [{ id: 'network' }, { id: 'flow' }, { id: 'table' }]

  it('compute emphasis lands on Flow when present', () => {
    expect(initialActiveView('compute', ALL)).toBe('flow')
  })

  it('relationship emphasis lands on Network when present', () => {
    expect(initialActiveView('relationship', ALL)).toBe('network')
  })

  it('falls back to the first enabled view when the preferred one is gated off', () => {
    expect(initialActiveView('relationship', [{ id: 'flow' }, { id: 'table' }])).toBe('flow')
    expect(initialActiveView('compute', [{ id: 'network' }, { id: 'table' }])).toBe('network')
  })

  it('falls back to flow for an empty enabled set (defensive; Flow is always registered)', () => {
    expect(initialActiveView('compute', [])).toBe('flow')
  })
})
