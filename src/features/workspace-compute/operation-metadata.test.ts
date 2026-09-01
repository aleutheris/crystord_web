import { describe, it, expect } from 'vitest'
import {
  BUILTIN_OPERATIONS,
  COLLECT_QUERIES,
  COLLECT_QUERY_OPTIONS,
  FALLBACK_OPERATIONS,
  argBounds,
  collectQueryEditor,
  collectQuerySpec,
  collectRequiredConstants,
  isCollectOperation,
} from './operation-metadata'

describe('operation metadata table', () => {
  // The client-side arity table. 9.3.0 publishes minArity/maxArity/numericOnly, which the
  // builder does not read yet (deferred) — so these numbers must match the guide by hand.
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

  it('registers the label query and both category queries (schema 9.3.0)', () => {
    expect(COLLECT_QUERIES).toEqual([
      'atoms_with_labels',
      'atoms_in_category_value',
      'atoms_in_category_subtree',
    ])
  })

  it('keeps atoms_with_labels first — it is the builder default selection', () => {
    expect(COLLECT_QUERIES[0]).toBe('atoms_with_labels')
  })

  it('gives every registered query human-readable picker text, not the registry name', () => {
    for (const spec of COLLECT_QUERY_OPTIONS) {
      expect(spec.label).not.toBe('')
      expect(spec.label).not.toBe(spec.name)
    }
  })

  it('declares the constants each registered query cannot run without', () => {
    // Since 9.3.0 the server rejects an empty required constant outright (user-guide.md:1305).
    expect(collectRequiredConstants('atoms_with_labels')).toEqual(['labels'])
    // Same rejection for a missing category pair; the silent case is a NON-empty unowned value.
    expect(collectRequiredConstants('atoms_in_category_value')).toEqual(['dimension_key', 'value_key'])
    expect(collectRequiredConstants('atoms_in_category_subtree')).toEqual(['dimension_key', 'value_key'])
  })

  it('declares no requirements for an unregistered query, so it stays saveable', () => {
    expect(collectRequiredConstants('atoms_by_owner')).toEqual([])
    expect(collectRequiredConstants('')).toEqual([])
    expect(collectQuerySpec('atoms_by_owner')).toBeUndefined()
  })

  it('routes each query to its constants editor, unregistered queries keeping labels', () => {
    expect(collectQueryEditor('atoms_with_labels')).toBe('labels')
    expect(collectQueryEditor('atoms_in_category_value')).toBe('category')
    expect(collectQueryEditor('atoms_in_category_subtree')).toBe('category')
    // The free-text path keeps the only constants affordance it has ever had.
    expect(collectQueryEditor('atoms_by_owner')).toBe('labels')
    expect(collectQueryEditor('')).toBe('labels')
  })

  it('the offline fallback catalog covers exactly the built-ins', () => {
    expect(FALLBACK_OPERATIONS.map((op) => op.name)).toEqual(Object.keys(BUILTIN_OPERATIONS))
    for (const op of FALLBACK_OPERATIONS) expect(op.description).not.toBe('')
  })
})
