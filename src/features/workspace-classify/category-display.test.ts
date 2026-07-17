import { describe, it, expect } from 'vitest'
import type { CategoryValue } from '../../api-contract/category-operations'
import {
  groupAssignmentsByDimension,
  valueDisplayName,
  buildCategoryPath,
  buildValueTree,
} from './category-display'

function value(key: string, displayName: string, parentValueKeys: string[] = []): CategoryValue {
  return {
    key,
    displayName,
    description: null,
    dimensionKey: 'region',
    parentValueKeys,
    accessLevel: 'OWNER',
    ownerUsername: 'demo',
  }
}

const REGION_VALUES = [
  value('europe', 'Europe'),
  value('belgium', 'Belgium', ['europe']),
  value('germany', 'Germany', ['europe']),
  value('antwerp', 'Antwerp', ['belgium']),
]

describe('groupAssignmentsByDimension', () => {
  it('groups assignments by dimension preserving first-seen order', () => {
    const groups = groupAssignmentsByDimension([
      { dimensionKey: 'region', valueKey: 'belgium' },
      { dimensionKey: 'period', valueKey: 'q1' },
      { dimensionKey: 'region', valueKey: 'germany' },
    ])
    expect([...groups.keys()]).toEqual(['region', 'period'])
    expect(groups.get('region')).toEqual([
      { dimensionKey: 'region', valueKey: 'belgium' },
      { dimensionKey: 'region', valueKey: 'germany' },
    ])
    expect(groups.get('period')).toEqual([{ dimensionKey: 'period', valueKey: 'q1' }])
  })

  it('returns an empty map for no assignments', () => {
    expect(groupAssignmentsByDimension([]).size).toBe(0)
  })
})

describe('valueDisplayName', () => {
  it('resolves the display name from the loaded values', () => {
    expect(valueDisplayName('belgium', REGION_VALUES)).toBe('Belgium')
  })

  it('falls back to the raw key when the value is unknown', () => {
    expect(valueDisplayName('atlantis', REGION_VALUES)).toBe('atlantis')
  })

  it('falls back to the raw key while values are not loaded yet', () => {
    expect(valueDisplayName('belgium', undefined)).toBe('belgium')
  })
})

describe('buildCategoryPath (ancestor tooltip, ADR-260063)', () => {
  it('walks the parent chain from root to value', () => {
    expect(buildCategoryPath('Region', 'antwerp', REGION_VALUES)).toBe('Region ▸ Europe ▸ Belgium ▸ Antwerp')
  })

  it('renders a root value as Dimension ▸ Value', () => {
    expect(buildCategoryPath('Region', 'europe', REGION_VALUES)).toBe('Region ▸ Europe')
  })

  it('falls back to the raw key while values are not loaded', () => {
    expect(buildCategoryPath('Region', 'belgium', undefined)).toBe('Region ▸ belgium')
  })

  it('stops the walk at a parent that is not in the loaded set', () => {
    const orphan = [value('belgium', 'Belgium', ['missing-parent'])]
    expect(buildCategoryPath('Region', 'belgium', orphan)).toBe('Region ▸ Belgium')
  })

  it('terminates on a (schema-invalid) parent cycle', () => {
    const cyclic = [value('a', 'A', ['b']), value('b', 'B', ['a'])]
    expect(buildCategoryPath('Region', 'a', cyclic)).toBe('Region ▸ B ▸ A')
  })
})

describe('buildValueTree (pick-mode tree, ADR-260063)', () => {
  it('nests children under their parent and keeps parentless values as roots', () => {
    const tree = buildValueTree(REGION_VALUES)
    expect(tree).toEqual([
      {
        key: 'europe',
        displayName: 'Europe',
        dimensionKey: 'region',
        children: [
          {
            key: 'belgium',
            displayName: 'Belgium',
            dimensionKey: 'region',
            children: [{ key: 'antwerp', displayName: 'Antwerp', dimensionKey: 'region' }],
          },
          { key: 'germany', displayName: 'Germany', dimensionKey: 'region' },
        ],
      },
    ])
  })

  it('treats a value whose parents are all missing as a root', () => {
    const tree = buildValueTree([value('belgium', 'Belgium', ['not-loaded'])])
    expect(tree).toEqual([{ key: 'belgium', displayName: 'Belgium', dimensionKey: 'region' }])
  })

  it('attaches a multi-parent value under its first loaded parent only', () => {
    const tree = buildValueTree([
      value('benelux', 'Benelux'),
      value('europe', 'Europe'),
      value('belgium', 'Belgium', ['benelux', 'europe']),
    ])
    expect(tree).toEqual([
      {
        key: 'benelux',
        displayName: 'Benelux',
        dimensionKey: 'region',
        children: [{ key: 'belgium', displayName: 'Belgium', dimensionKey: 'region' }],
      },
      { key: 'europe', displayName: 'Europe', dimensionKey: 'region' },
    ])
  })

  it('drops values only reachable through a (schema-invalid) cycle instead of recursing', () => {
    const tree = buildValueTree([value('root', 'Root'), value('a', 'A', ['b']), value('b', 'B', ['a'])])
    expect(tree).toEqual([{ key: 'root', displayName: 'Root', dimensionKey: 'region' }])
  })

  it('returns an empty tree for no values', () => {
    expect(buildValueTree([])).toEqual([])
  })
})
