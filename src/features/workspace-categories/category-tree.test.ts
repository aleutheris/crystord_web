import { describe, it, expect } from 'vitest'
import { buildCategoryTree, isPendingKey } from './category-tree'
import type { CategoryBrowseChild, CategoryDimension } from '../../api-contract'

function dim(key: string, accessLevel: CategoryDimension['accessLevel'] = 'OWNER'): CategoryDimension {
  return { key, displayName: key.toUpperCase(), description: null, parentDimensionKeys: [], accessLevel, ownerUsername: 'demo' }
}

function child(key: string, dimensionKey: string, atomCount: number, accessLevel: CategoryBrowseChild['value']['accessLevel'] = 'OWNER'): CategoryBrowseChild {
  return {
    value: { key, displayName: key.toUpperCase(), dimensionKey, parentValueKeys: [], accessLevel },
    atomCount,
  }
}

describe('buildCategoryTree', () => {
  it('returns an empty model for no dimensions', () => {
    const model = buildCategoryTree([], new Map())
    expect(model.nodes).toEqual([])
    expect(model.index.size).toBe(0)
  })

  it('gives an unbrowsed dimension a pending placeholder child (expand affordance)', () => {
    const model = buildCategoryTree([dim('region')], new Map())
    expect(model.nodes).toHaveLength(1)
    const children = model.nodes[0]!.children!
    expect(children).toHaveLength(1)
    expect(children[0]!.displayName).toBe('Loading…')
    expect(isPendingKey(children[0]!.key)).toBe(true)
    // Placeholders are synthetic — they never enter the meta index.
    expect(model.index.has(children[0]!.key)).toBe(false)
  })

  it('indexes dimension nodes with kind/accessLevel and no parent', () => {
    const model = buildCategoryTree([dim('region', 'VIEWER')], new Map())
    expect(model.index.get('region')).toEqual({
      kind: 'dimension',
      key: 'region',
      displayName: 'REGION',
      dimensionKey: 'region',
      accessLevel: 'VIEWER',
      parent: null,
    })
  })

  it('renders browsed children with atom counts and indexes them with their parent ref', () => {
    const cache = new Map([['region', [child('europe', 'region', 4, 'EDITOR')]]])
    const model = buildCategoryTree([dim('region')], cache)
    const europe = model.nodes[0]!.children![0]!
    expect(europe).toMatchObject({ key: 'europe', displayName: 'EUROPE', dimensionKey: 'region', atomCount: 4 })
    expect(model.index.get('europe')).toEqual({
      kind: 'value',
      key: 'europe',
      displayName: 'EUROPE',
      dimensionKey: 'region',
      accessLevel: 'EDITOR',
      parent: { kind: 'dimension', key: 'region' },
    })
  })

  it('a browsed value without its own browse entry gets a placeholder child', () => {
    const cache = new Map([['region', [child('europe', 'region', 4)]]])
    const model = buildCategoryTree([dim('region')], cache)
    const europeChildren = model.nodes[0]!.children![0]!.children!
    expect(europeChildren).toHaveLength(1)
    expect(isPendingKey(europeChildren[0]!.key)).toBe(true)
  })

  it('nests browsed grandchildren and records the value parent ref', () => {
    const cache = new Map([
      ['region', [child('europe', 'region', 4)]],
      ['europe', [child('belgium', 'region', 2)]],
    ])
    const model = buildCategoryTree([dim('region')], cache)
    const belgium = model.nodes[0]!.children![0]!.children![0]!
    expect(belgium).toMatchObject({ key: 'belgium', atomCount: 2 })
    expect(model.index.get('belgium')!.parent).toEqual({ kind: 'value', key: 'europe' })
  })

  it('a browsed-empty node renders no children (leaf, no placeholder)', () => {
    const cache = new Map([['region', [] as CategoryBrowseChild[]]])
    const model = buildCategoryTree([dim('region')], cache)
    expect(model.nodes[0]!.children).toEqual([])
  })

  it('guards against hierarchy cycles re-entering an ancestor of the branch', () => {
    // Value DAGs allow a → b; a corrupt/cyclic cache b → a must not recurse forever.
    const cache = new Map([
      ['region', [child('a', 'region', 1)]],
      ['a', [child('b', 'region', 1)]],
      ['b', [child('a', 'region', 1)]],
    ])
    const model = buildCategoryTree([dim('region')], cache)
    const a = model.nodes[0]!.children![0]!
    const b = a.children![0]!
    expect(b.key).toBe('b')
    expect(b.children).toEqual([])
  })
})
