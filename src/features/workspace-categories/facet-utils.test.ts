import { describe, it, expect } from 'vitest'
import { toggleFacetValue } from './facet-utils'
import type { CategoryFacetFilter } from '../../ui-primitives'

// Facet semantics (ADR-260064 / REQ-FR-260072): OR within a dimension, AND across dimensions,
// includeDescendants only on NEW entries, empty entries dropped.
describe('toggleFacetValue', () => {
  it('creates a new entry for an untouched dimension (includeDescendants honored)', () => {
    expect(toggleFacetValue([], 'region', 'europe', true)).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
    ])
    expect(toggleFacetValue([], 'region', 'europe', false)).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: false },
    ])
  })

  it('ORs a second value into the existing dimension entry', () => {
    const start: CategoryFacetFilter[] = [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }]
    expect(toggleFacetValue(start, 'region', 'asia', true)).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe', 'asia'], includeDescendants: true },
    ])
  })

  it('an existing entry keeps its includeDescendants when a value is added', () => {
    const start: CategoryFacetFilter[] = [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }]
    // Checkbox flipped off since the entry was created — the entry setting wins (ADR-260064).
    expect(toggleFacetValue(start, 'region', 'asia', false)).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe', 'asia'], includeDescendants: true },
    ])
  })

  it('ANDs across dimensions with one entry per dimension', () => {
    const start = toggleFacetValue([], 'region', 'europe', true)
    expect(toggleFacetValue(start, 'period', 'q1', false)).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ])
  })

  it('removes an already-selected value, keeping the rest of the entry', () => {
    const start: CategoryFacetFilter[] = [{ dimensionKey: 'region', valueKeys: ['europe', 'asia'], includeDescendants: true }]
    expect(toggleFacetValue(start, 'region', 'europe', true)).toEqual([
      { dimensionKey: 'region', valueKeys: ['asia'], includeDescendants: true },
    ])
  })

  it('drops the entry entirely when its last value is removed', () => {
    const start: CategoryFacetFilter[] = [
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ]
    expect(toggleFacetValue(start, 'region', 'europe', true)).toEqual([
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ])
  })

  it('leaves other dimension entries untouched on add and remove', () => {
    const start: CategoryFacetFilter[] = [
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ]
    expect(toggleFacetValue(start, 'period', 'q2', true)).toEqual([
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1', 'q2'], includeDescendants: false },
    ])
    const multi: CategoryFacetFilter[] = [
      { dimensionKey: 'region', valueKeys: ['europe', 'asia'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ]
    expect(toggleFacetValue(multi, 'region', 'europe', true)).toEqual([
      { dimensionKey: 'region', valueKeys: ['asia'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ])
  })

  it('never mutates its input', () => {
    const entry: CategoryFacetFilter = { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }
    const start = [entry]
    toggleFacetValue(start, 'region', 'asia', true)
    toggleFacetValue(start, 'region', 'europe', true)
    expect(start).toEqual([{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }])
    expect(entry.valueKeys).toEqual(['europe'])
  })
})
