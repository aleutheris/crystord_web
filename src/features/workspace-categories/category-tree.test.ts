import { describe, it, expect } from 'vitest'
import { buildCategoryTree, dimensionSubtreeKeys, dimensionOutline, isPendingKey, nodeKeyFor } from './category-tree'
import type { CategoryNodeMeta } from './category-tree'
import type { CategoryBrowseChild, CategoryDimension } from '../../api-contract'
import type { CategoryTreeNode } from '../../ui-primitives'

function dim(key: string, accessLevel: CategoryDimension['accessLevel'] = 'OWNER'): CategoryDimension {
  return { key, displayName: key.toUpperCase(), description: null, parentDimensionKeys: [], accessLevel, ownerUsername: 'demo' }
}

/** A dimension nested under `parentKey` via UNDER_CATDIM (single-parent, so one key). */
function nested(key: string, parentKey: string): CategoryDimension {
  return { ...dim(key), parentDimensionKeys: [parentKey] }
}

/** Every real node key in render order — placeholders excluded, so counts are about real data. */
/** Node keys are kind-qualified (`dimension:region`); tests read better in real-key space. */
function realKey(nodeKey: string): string {
  return nodeKey.slice(nodeKey.indexOf(':') + 1)
}

/** Look a node up by its real key. Fixtures never collide, so trying both kinds is unambiguous. */
function metaOf(model: ReturnType<typeof buildCategoryTree>, key: string) {
  return model.index.get(nodeKeyFor('dimension', key)) ?? model.index.get(nodeKeyFor('value', key))
}

function keysOf(nodes: CategoryTreeNode[]): string[] {
  return nodes.flatMap((node) => (isPendingKey(node.key) ? [] : [realKey(node.key), ...keysOf(node.children ?? [])]))
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
    expect(metaOf(model, 'region')).toEqual({
      kind: 'dimension',
      key: 'region',
      displayName: 'REGION',
      dimensionKey: 'region',
      accessLevel: 'VIEWER',
      parent: null,
      parentDimensionKey: null,
    })
  })

  it('renders browsed children with atom counts and indexes them with their parent ref', () => {
    const cache = new Map([['region', [child('europe', 'region', 4, 'EDITOR')]]])
    const model = buildCategoryTree([dim('region')], cache)
    const europe = model.nodes[0]!.children![0]!
    expect(europe).toMatchObject({ key: nodeKeyFor('value', 'europe'), displayName: 'EUROPE', dimensionKey: 'region', atomCount: 4 })
    expect(metaOf(model, 'europe')).toEqual({
      kind: 'value',
      key: 'europe',
      displayName: 'EUROPE',
      dimensionKey: 'region',
      accessLevel: 'EDITOR',
      parent: { kind: 'dimension', key: 'region' },
      parentDimensionKey: null,
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
    expect(belgium).toMatchObject({ key: nodeKeyFor('value', 'belgium'), atomCount: 2 })
    expect(metaOf(model, 'belgium')!.parent).toEqual({ kind: 'value', key: 'europe' })
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
    expect(realKey(b.key)).toBe('b')
    expect(b.children).toEqual([])
  })

  it('nests a child dimension under its parent instead of at the top level', () => {
    const model = buildCategoryTree([dim('region'), nested('city', 'region')], new Map())
    expect(model.nodes.map((node) => realKey(node.key))).toEqual(['region'])
    expect(model.nodes[0]!.children!.map((node) => realKey(node.key))).toContain('city')
  })

  it('keeps parentless dimensions at the top level', () => {
    const model = buildCategoryTree([dim('region'), dim('period')], new Map())
    expect(model.nodes.map((node) => realKey(node.key))).toEqual(['region', 'period'])
  })

  it('renders a dimension as a root when its parent is missing from the set', () => {
    // The parent can be access-scoped away for this user, or the key can be stale. Either way the
    // dimension must stay reachable in the rail rather than disappear with its absent parent.
    const model = buildCategoryTree([nested('city', 'region')], new Map())
    expect(model.nodes.map((node) => realKey(node.key))).toEqual(['city'])
    expect(metaOf(model, 'city')!.parentDimensionKey).toBeNull()
  })

  it('nests dimensions to arbitrary depth', () => {
    const model = buildCategoryTree([dim('a'), nested('b', 'a'), nested('c', 'b')], new Map())
    expect(model.nodes.map((node) => realKey(node.key))).toEqual(['a'])
    const b = model.nodes[0]!.children![0]!
    expect(realKey(b.key)).toBe('b')
    expect(b.children!.map((node) => realKey(node.key))).toContain('c')
  })

  it('lists child dimensions before the parent dimension’s own values', () => {
    // Structure above contents: the sub-dimensions frame how the values below them are read.
    const cache = new Map([['region', [child('europe', 'region', 4)]]])
    const model = buildCategoryTree([dim('region'), nested('city', 'region')], cache)
    expect(model.nodes[0]!.children!.map((node) => realKey(node.key))).toEqual(['city', 'europe'])
  })

  it('indexes a nested dimension with its hierarchy parent but no browse parent', () => {
    // parentDimensionKey drives the re-parent control; parent drives cache refresh. A nested
    // dimension still comes from retrieveCategoryDimensions, so it belongs to no browse cache.
    const cache = new Map([['region', [child('europe', 'region', 1)]], ['city', [] as CategoryBrowseChild[]]])
    const model = buildCategoryTree([dim('region'), nested('city', 'region')], cache)
    expect(metaOf(model, 'city')).toMatchObject({ kind: 'dimension', parent: null, parentDimensionKey: 'region' })
    expect(metaOf(model, 'region')!.parentDimensionKey).toBeNull()
    expect(metaOf(model, 'europe')!.parentDimensionKey).toBeNull()
  })

  it('renders both dimensions of a stale parent cycle exactly once', () => {
    // The server rejects cycles (CAT-DIMENSION-CYCLE), but concurrent edits can still deliver
    // a→b→a. Neither dimension is a root, so without the rescue both would vanish from the rail.
    const model = buildCategoryTree([nested('a', 'b'), nested('b', 'a')], new Map())
    expect(keysOf(model.nodes).sort()).toEqual(['a', 'b'])
    expect(model.index.size).toBe(2)
  })

  it('treats a dimension listing itself as its own parent as a root', () => {
    const model = buildCategoryTree([nested('loopy', 'loopy'), dim('region')], new Map())
    expect(keysOf(model.nodes)).toEqual(['loopy', 'region'])
  })

  it('renders every dimension exactly once when a cycle has an extra dependant', () => {
    // Regression: the rescue loop used to guard per-branch rather than across the whole traversal,
    // so a dimension already emitted as a rescued root was emitted AGAIN inside a later branch.
    // c -> a -> b -> a produced ['c','a','c','b'] — 'c' twice, which React would flag as a
    // duplicate key and which double-counts the taxonomy in the rail.
    const model = buildCategoryTree([nested('c', 'a'), nested('a', 'b'), nested('b', 'a')], new Map())
    const keys = keysOf(model.nodes)
    expect([...keys].sort()).toEqual(['a', 'b', 'c'])
    expect(keys).toHaveLength(3)
    expect(model.index.size).toBe(3)
  })

  it('reports a rescued cyclic dimension as a root in its meta, matching where it renders', () => {
    // The re-parent selector seeds from parentDimensionKey while its options exclude the node's own
    // subtree. A meta that claims a parent the tree did not actually use would preselect an option
    // that is not in the list, leaving the control showing nothing selectable.
    const model = buildCategoryTree([nested('a', 'b'), nested('b', 'a')], new Map())
    expect(metaOf(model, 'a')!.parentDimensionKey).toBeNull()
    expect(metaOf(model, 'b')!.parentDimensionKey).toBe('a')
  })

  it('reports a self-parented dimension as a root in its meta', () => {
    const model = buildCategoryTree([dim('loopy')].map((d) => ({ ...d, parentDimensionKeys: ['loopy'] })), new Map())
    expect(metaOf(model, 'loopy')!.parentDimensionKey).toBeNull()
  })
})

describe('dimensionSubtreeKeys', () => {
  it('collects every sibling under a shared parent', () => {
    // Two children of one parent exercise the append-to-existing-group path, not just group
    // creation — a subtree that dropped later siblings would under-filter the parent options and
    // let the user pick a descendant as its own parent.
    const keys = dimensionSubtreeKeys(buildCategoryTree([nested('b', 'a'), nested('c', 'a'), dim('a')], new Map()), 'a')
    expect([...keys].sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns just the dimension when nothing is nested under it', () => {
    expect(dimensionSubtreeKeys(buildCategoryTree([dim('region'), dim('period')], new Map()), 'region')).toEqual(new Set(['region']))
  })

  it('returns the dimension and every descendant, skipping unrelated branches', () => {
    // These keys are the illegal re-parent targets: moving `a` under `c` would form a cycle.
    const dimensions = [dim('a'), nested('b', 'a'), nested('c', 'b'), dim('other')]
    expect(dimensionSubtreeKeys(buildCategoryTree(dimensions, new Map()), 'a')).toEqual(new Set(['a', 'b', 'c']))
    expect(dimensionSubtreeKeys(buildCategoryTree(dimensions, new Map()), 'b')).toEqual(new Set(['b', 'c']))
  })

  it('terminates on stale cyclic data', () => {
    expect(dimensionSubtreeKeys(buildCategoryTree([nested('a', 'b'), nested('b', 'a')], new Map()), 'a')).toEqual(new Set(['a', 'b']))
    expect(dimensionSubtreeKeys(buildCategoryTree([nested('loopy', 'loopy')], new Map()), 'loopy')).toEqual(new Set(['loopy']))
  })
})

describe('parent options never disagree with the seeded parent', () => {
  it('keeps a rescued cyclic dimension\'s current parent among its own options', () => {
    // Regression: the exclusion set used to be computed from raw parentDimensionKeys while the
    // editor seeded from the EFFECTIVE render parent. Under a rescued cycle the two disagreed —
    // b rendered under a, but the raw-data subtree of b also contained a, so a was filtered out
    // and the select was seeded to an option it did not offer, rendering blank.
    const dimensions = [nested('a', 'b'), nested('b', 'a')]
    const model = buildCategoryTree(dimensions, new Map())
    const seeded = metaOf(model, 'b')!.parentDimensionKey
    const excluded = dimensionSubtreeKeys(model, 'b')

    expect(seeded).toBe('a')
    expect(excluded.has(seeded!)).toBe(false)
  })

  it('offers every dimension whose subtree does not contain the edited one', () => {
    const model = buildCategoryTree([dim('a'), nested('b', 'a'), nested('c', 'b'), dim('z')], new Map())
    const excluded = dimensionSubtreeKeys(model, 'b')
    expect([...excluded].sort()).toEqual(['b', 'c'])
  })
})

describe('dimensionOutline', () => {
  it('lists dimensions in render order with their depth', () => {
    const model = buildCategoryTree([dim('a'), nested('b', 'a'), nested('c', 'b'), dim('z')], new Map())
    expect(dimensionOutline(model)).toEqual([
      { key: 'a', displayName: 'A', depth: 0 },
      { key: 'b', displayName: 'B', depth: 1 },
      { key: 'c', displayName: 'C', depth: 2 },
      { key: 'z', displayName: 'Z', depth: 0 },
    ])
  })

  it('omits value nodes so only dimensions are offerable as parents', () => {
    const cache = new Map([['region', [child('europe', 'region', 2)]]])
    const model = buildCategoryTree([dim('region')], cache)
    expect(dimensionOutline(model).map((e) => e.key)).toEqual(['region'])
  })
})

describe('outline and subtree guards against a malformed model', () => {
  // Both functions are exported and take a CategoryTreeModel, so they must tolerate a model that
  // buildCategoryTree would never produce. These guards are unreachable through the builder — the
  // rendered-once traversal makes the dimension graph a forest — but they are the contract for any
  // other caller.
  function meta(key: string, parentDimensionKey: string | null): CategoryNodeMeta {
    return {
      kind: 'dimension', key, displayName: key.toUpperCase(), dimensionKey: key,
      accessLevel: 'OWNER', parent: null, parentDimensionKey,
    }
  }

  it('tolerates a dimension node carrying no children array', () => {
    const model = {
      nodes: [{ key: 'a', displayName: 'A' }],
      index: new Map([['a', meta('a', null)]]),
    }
    expect(dimensionOutline(model)).toEqual([{ key: 'a', displayName: 'A', depth: 0 }])
  })

  it('terminates on a model whose effective parents form a cycle', () => {
    const model = {
      nodes: [],
      index: new Map([['a', meta('a', 'b')], ['b', meta('b', 'a')]]),
    }
    expect([...dimensionSubtreeKeys(model, 'a')].sort()).toEqual(['a', 'b'])
  })
})

describe('the rendered tree does not depend on server row order', () => {
  it('nests a dependant of a cycle under its real parent whichever order the rows arrive in', () => {
    // Regression: the rescue promoted whichever unrendered dimension came first in the array. With
    // a <-> b cyclic and c legitimately under a, listing c first hoisted it to a root reporting no
    // parent — the same logical graph rendering two different ways depending on row order. The walk
    // now climbs to a member OF the cycle and promotes that, so dependants attach where they belong.
    const rows = [nested('c', 'a'), nested('a', 'b'), nested('b', 'a')]
    const reversed = [nested('a', 'b'), nested('b', 'a'), nested('c', 'a')]

    for (const model of [buildCategoryTree(rows, new Map()), buildCategoryTree(reversed, new Map())]) {
      expect(model.nodes.map((node) => realKey(node.key))).toEqual(['a'])
      expect(metaOf(model, 'c')!.parentDimensionKey).toBe('a')
      expect(keysOf(model.nodes).sort()).toEqual(['a', 'b', 'c'])
    }
  })
})

describe('dimension and value keys are separate namespaces', () => {
  it('keeps a dimension addressable when a value shares its key', () => {
    // Regression: node keys were the raw key, so a value keyed 'city' overwrote the dimension keyed
    // 'city' in the meta index. That pruned the dimension and everything beneath it from the parent
    // selectors, and gave two sibling nodes the same React key and the same expandedKeys entry.
    // Server-side the two are distinct namespaces — deleteCategoryDimension and deleteCategoryValue
    // are separate operations — so the collision is ordinary data, not corruption.
    const dimensions = [dim('region'), nested('city', 'region'), nested('district', 'city')]
    const cache = new Map([['region', [child('city', 'region', 1)]]])
    const model = buildCategoryTree(dimensions, cache)

    expect(metaOf(model, 'city')).toBeDefined()
    expect(model.index.get(nodeKeyFor('dimension', 'city'))!.kind).toBe('dimension')
    expect(model.index.get(nodeKeyFor('value', 'city'))!.kind).toBe('value')
    // The colliding dimension and its subtree stay offerable as parents.
    expect(dimensionOutline(model).map((entry) => entry.key)).toEqual(['region', 'city', 'district'])
  })

  it('offers the seeded parent even when that parent collides with a value key', () => {
    const dimensions = [dim('region'), nested('city', 'region'), nested('district', 'city')]
    const cache = new Map([['region', [child('city', 'region', 1)]]])
    const model = buildCategoryTree(dimensions, cache)

    const seeded = metaOf(model, 'district')!.parentDimensionKey
    const excluded = dimensionSubtreeKeys(model, 'district')
    const offered = dimensionOutline(model).filter((entry) => !excluded.has(entry.key)).map((e) => e.key)

    expect(seeded).toBe('city')
    expect(offered).toContain(seeded)
  })
})
