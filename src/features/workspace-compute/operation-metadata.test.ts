import { describe, it, expect } from 'vitest'
import {
  BUILTIN_OPERATIONS,
  COLLECT_QUERIES,
  FALLBACK_OPERATIONS,
  argBounds,
  collectQueryRequiresLabels,
  isCollectOperation,
} from './operation-metadata'

describe('operation metadata table', () => {
  // The client-side arity table (ADR-260065): discovery exposes no arity metadata.
  it.each([
    ['SUM', { min: 1 }],
    ['MINUS', { min: 2, max: 2 }],
    ['PRODUCT', { min: 2 }],
    ['DIVIDE', { min: 2, max: 2 }],
  ])('%s carries the documented arity', (name, bounds) => {
    expect(argBounds(name)).toMatchObject(bounds)
  })

  it('COLLECT is the special-cased single-arg operation', () => {
    expect(argBounds('COLLECT')).toMatchObject({ min: 1, max: 1 })
    expect(isCollectOperation('COLLECT')).toBe(true)
  })

  it('non-collect built-ins are not collect operations', () => {
    expect(isCollectOperation('SUM')).toBe(false)
  })

  it('unknown operations get the generic variadic fallback, not a block', () => {
    expect(argBounds('FUTURE_OP')).toEqual({ min: 0 })
    expect(isCollectOperation('FUTURE_OP')).toBe(false)
  })

  it('the registered COLLECT queries are label-only today', () => {
    expect(COLLECT_QUERIES).toEqual(['atoms_with_labels'])
  })

  it('marks atoms_with_labels as label-requiring and unknown queries as not', () => {
    // Empty labels is not a no-op server-side (vacuous AND matches every owned atom).
    expect(collectQueryRequiresLabels('atoms_with_labels')).toBe(true)
    expect(collectQueryRequiresLabels('atoms_by_owner')).toBe(false)
    expect(collectQueryRequiresLabels('')).toBe(false)
  })

  it('the offline fallback catalog covers exactly the built-ins', () => {
    expect(FALLBACK_OPERATIONS.map((op) => op.name)).toEqual(Object.keys(BUILTIN_OPERATIONS))
    for (const op of FALLBACK_OPERATIONS) expect(op.description).not.toBe('')
  })
})
