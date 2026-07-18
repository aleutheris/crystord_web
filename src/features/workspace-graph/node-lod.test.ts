import { describe, it, expect } from 'vitest'
import { LOD_THRESHOLD, DOT_CAP, lodStateForZoom, capDots, truncateValue, classificationDots } from './node-lod'

// ADR-260067 / EPIC-260072 / REQ-FR-260075 — pure LOD helpers for the Flow AtomNode.

describe('lodStateForZoom', () => {
  it('pins the threshold at 0.75', () => {
    expect(LOD_THRESHOLD).toBe(0.75)
  })

  it('is compact below the threshold', () => {
    expect(lodStateForZoom(0)).toBe('compact')
    expect(lodStateForZoom(0.74)).toBe('compact')
  })

  it('is block exactly at the threshold (>= semantics)', () => {
    expect(lodStateForZoom(0.75)).toBe('block')
  })

  it('is block above the threshold', () => {
    expect(lodStateForZoom(1)).toBe('block')
    expect(lodStateForZoom(2)).toBe('block')
  })
})

describe('capDots', () => {
  it('passes short lists through with no overflow', () => {
    expect(capDots([])).toEqual({ visible: [], overflow: 0 })
    expect(capDots(['a'])).toEqual({ visible: ['a'], overflow: 0 })
  })

  it('shows a list exactly at the cap in full', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(items).toHaveLength(DOT_CAP)
    expect(capDots(items)).toEqual({ visible: items, overflow: 0 })
  })

  it('caps longer lists and reports the hidden count', () => {
    expect(capDots(['a', 'b', 'c', 'd', 'e'])).toEqual({ visible: ['a', 'b', 'c', 'd'], overflow: 1 })
    expect(capDots(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual({ visible: ['a', 'b', 'c', 'd'], overflow: 3 })
  })
})

describe('truncateValue', () => {
  it('returns short values unchanged', () => {
    expect(truncateValue('42')).toBe('42')
    expect(truncateValue('')).toBe('')
  })

  it('keeps a value exactly at the default max (24) unchanged', () => {
    const exact = 'x'.repeat(24)
    expect(truncateValue(exact)).toBe(exact)
  })

  it('truncates past the max with an ellipsis', () => {
    expect(truncateValue('x'.repeat(25))).toBe(`${'x'.repeat(24)}…`)
  })

  it('honors a custom max', () => {
    expect(truncateValue('abcdef', 3)).toBe('abc…')
    expect(truncateValue('abc', 3)).toBe('abc')
  })
})

describe('classificationDots', () => {
  it('maps labels to round dots and category dimensions to square dots, labels first', () => {
    const dots = classificationDots(['Num'], [{ dimensionKey: 'region', valueKey: 'europe' }])
    expect(dots).toEqual([
      { text: 'Num', shape: 'round' },
      { text: 'region', shape: 'square' },
    ])
  })

  it('renders one square dot per DISTINCT dimension key', () => {
    const dots = classificationDots([], [
      { dimensionKey: 'region', valueKey: 'europe' },
      { dimensionKey: 'region', valueKey: 'asia' },
      { dimensionKey: 'stage', valueKey: 'draft' },
    ])
    expect(dots).toEqual([
      { text: 'region', shape: 'square' },
      { text: 'stage', shape: 'square' },
    ])
  })

  it('is empty for an unclassified atom', () => {
    expect(classificationDots([], [])).toEqual([])
  })
})
