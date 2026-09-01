import { describe, it, expect } from 'vitest'
import {
  buildCollectConstants,
  collectBlockMessage,
  isEmptyConstant,
  missingCollectConstants,
  stringConstant,
} from './collect-constants'

const EMPTY_DRAFT = { labels: [], dimensionKey: '', valueKey: '' }

describe('stringConstant', () => {
  it('passes strings through and reads anything else as unset', () => {
    expect(stringConstant('region')).toBe('region')
    expect(stringConstant('')).toBe('')
    expect(stringConstant(7)).toBe('')
    expect(stringConstant(null)).toBe('')
    expect(stringConstant(undefined)).toBe('')
    expect(stringConstant(['region'])).toBe('')
  })
})

describe('isEmptyConstant', () => {
  it('treats absent, blank, and empty-list values as empty', () => {
    expect(isEmptyConstant(undefined)).toBe(true)
    expect(isEmptyConstant(null)).toBe(true)
    expect(isEmptyConstant('')).toBe(true)
    expect(isEmptyConstant([])).toBe(true)
  })

  it('treats any present value as supplied', () => {
    expect(isEmptyConstant('region')).toBe(false)
    expect(isEmptyConstant(['Invoice'])).toBe(false)
    expect(isEmptyConstant(0)).toBe(false)
  })
})

describe('buildCollectConstants', () => {
  it('writes only the labels constant for the labels editor', () => {
    expect(buildCollectConstants('labels', { ...EMPTY_DRAFT, labels: ['Invoice'] }))
      .toEqual({ labels: ['Invoice'] })
  })

  it('writes only the category constants for the category editor', () => {
    // Stale labels from an earlier query selection must not ride along.
    const constants = buildCollectConstants('category', {
      labels: ['Invoice'],
      dimensionKey: 'region',
      valueKey: 'europe',
    })
    expect(constants).toEqual({ dimension_key: 'region', value_key: 'europe' })
    expect(constants).not.toHaveProperty('labels')
  })

  it('copies the labels list rather than aliasing the caller’s array', () => {
    const labels = ['Invoice']
    const constants = buildCollectConstants('labels', { ...EMPTY_DRAFT, labels })
    expect(constants.labels).not.toBe(labels)
  })
})

describe('missingCollectConstants', () => {
  it('names the empty required constant for the labels query', () => {
    expect(missingCollectConstants('atoms_with_labels', { labels: [] })).toEqual(['labels'])
    expect(missingCollectConstants('atoms_with_labels', { labels: ['Invoice'] })).toEqual([])
  })

  it('requires both keys for a category query', () => {
    expect(missingCollectConstants('atoms_in_category_value', { dimension_key: '', value_key: '' }))
      .toEqual(['dimension_key', 'value_key'])
    expect(missingCollectConstants('atoms_in_category_subtree', { dimension_key: 'region', value_key: '' }))
      .toEqual(['value_key'])
    expect(missingCollectConstants('atoms_in_category_subtree', { dimension_key: 'region', value_key: 'europe' }))
      .toEqual([])
  })

  it('gates nothing for an unregistered query — its requirements are unknowable', () => {
    expect(missingCollectConstants('atoms_by_owner', {})).toEqual([])
    expect(missingCollectConstants('', {})).toEqual([])
  })
})

describe('collectBlockMessage', () => {
  it('asks for a label when the labels constant is missing', () => {
    // Since 9.3.0 an empty required constant fails evaluation (user-guide.md:1305) — the message
    // must not claim the pre-9.3.0 "collects every atom you own" behaviour.
    expect(collectBlockMessage(['labels']))
      .toBe('Add at least one label — this query cannot run with an empty filter.')
  })

  it('asks for a dimension and value for a missing category pair', () => {
    expect(collectBlockMessage(['dimension_key', 'value_key']))
      .toBe('Choose a category dimension and value — this query cannot run with an empty filter.')
    expect(collectBlockMessage(['value_key']))
      .toBe('Choose a category dimension and value — this query cannot run with an empty filter.')
  })

  it('describes the same hazard for both families — only the asked-for action differs', () => {
    // The genuinely asymmetric case is a NON-empty but unowned value_key, gated separately.
    expect(collectBlockMessage(['labels'])).toContain('cannot run with an empty filter')
    expect(collectBlockMessage(['dimension_key'])).toContain('cannot run with an empty filter')
  })
})
