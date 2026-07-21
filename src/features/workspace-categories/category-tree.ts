import type { CategoryBrowseChild, CategoryDimension } from '../../api-contract'
import type { CategoryTreeNode } from '../../ui-primitives'

/**
 * Pure tree-model builder for the Categories navigator (ADR-260071, superseding ADR-260064's flat
 * top level): top level = **root** dimensions, each nesting its child dimensions and then its
 * values from the per-node browse cache. Unbrowsed nodes get a synthetic "Loading…" child so the
 * shared CategoryTree shows an expand affordance before the lazy load has run.
 *
 * The dimension hierarchy is assembled here rather than fetched: `retrieveCategoryBrowse` returns
 * a dimension's root *values*, never its child dimensions, so the tree comes from
 * `retrieveCategoryDimensions` + each dimension's `parentDimensionKeys`.
 */

const PENDING_SUFFIX = '##pending'

/** True for the synthetic placeholder child of a not-yet-browsed node. */
export function isPendingKey(key: string): boolean {
  return key.endsWith(PENDING_SUFFIX)
}

/**
 * Tree-node identity. Dimension keys and value keys are **separate namespaces** server-side —
 * `deleteCategoryDimension(key)` and `deleteCategoryValue(key)` are distinct operations — so a
 * dimension and a value may legitimately share a key. Keying tree nodes on the raw key lets a
 * value silently overwrite a dimension in the meta index, which prunes that dimension and its
 * whole subtree from the parent selectors, and gives two sibling nodes the same React key and the
 * same entry in `expandedKeys`.
 *
 * Node keys are therefore qualified by kind. The real key stays on `CategoryNodeMeta.key`, which
 * is what every API call uses; callers resolve a node key through the index rather than parsing it.
 */
export function nodeKeyFor(kind: 'dimension' | 'value', key: string): string {
  return `${kind}:${key}`
}

export interface BrowseNodeRef {
  kind: 'dimension' | 'value'
  key: string
}

export interface CategoryNodeMeta {
  kind: 'dimension' | 'value'
  key: string
  displayName: string
  /** The dimension the node belongs to (itself, for dimension nodes). */
  dimensionKey: string
  accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER'
  /**
   * The node whose **browse cache** lists this node — used to refresh the right slice after
   * authoring. Always null for dimensions: they come from `retrieveCategoryDimensions`, not from
   * any node's browse cache, even when nested under a parent dimension.
   */
  parent: BrowseNodeRef | null
  /**
   * For a dimension node, its parent in the `UNDER_CATDIM` schema (null = root). Drives the
   * re-parenting controls, and is deliberately separate from `parent` above, which is about
   * cache refresh rather than hierarchy. Always null for value nodes.
   */
  parentDimensionKey: string | null
}

export interface CategoryTreeModel {
  nodes: CategoryTreeNode[]
  index: ReadonlyMap<string, CategoryNodeMeta>
}

/** One dimension in render order, with its nesting depth — the shape the parent selectors need. */
export interface DimensionOutlineEntry {
  key: string
  displayName: string
  depth: number
}

/**
 * Indents an outline entry by its depth for display in a `<select>`. `<option>` collapses ordinary
 * leading whitespace, so the indent uses non-breaking spaces.
 */
export function indentOption({ displayName, depth }: DimensionOutlineEntry): string {
  return depth === 0 ? displayName : `${'\u00a0'.repeat(depth * 4)}${displayName}`
}

/**
 * Dimensions in the order they render, each with its depth. A flat list of display names is
 * ambiguous once a taxonomy nests — two branches can hold similarly-named dimensions — so the
 * selectors indent by depth rather than presenting an unordered set.
 */
export function dimensionOutline(model: CategoryTreeModel): DimensionOutlineEntry[] {
  const entries: DimensionOutlineEntry[] = []
  function walk(nodes: CategoryTreeNode[], depth: number) {
    for (const node of nodes) {
      const meta = model.index.get(node.key)
      if (meta?.kind !== 'dimension') continue
      // The real key — selectors submit this to createDimension / setDimensionParent.
      entries.push({ key: meta.key, displayName: node.displayName, depth })
      walk(node.children ?? [], depth + 1)
    }
  }
  walk(model.nodes, 0)
  return entries
}

/**
 * The dimension itself plus every dimension beneath it (ADR-260071). Used to exclude illegal
 * parents from the re-parent selector: attaching a dimension to its own descendant would form a
 * cycle, which the server refuses. Keeping those options out of the list means the user cannot
 * construct the error in the first place.
 *
 * Takes the built model, NOT the raw dimension list, so it walks the same effective parents the
 * tree rendered. Reading raw `parentDimensionKeys` here would let the two graphs disagree under
 * stale cyclic data: a node rescued to a root still claims its old parent, and the exclusion set
 * computed from that claim would strip the very option the selector is seeded with, leaving a
 * control seeded to a value it does not offer.
 *
 * Traversal is guarded so cyclic data terminates instead of recursing forever.
 */
export function dimensionSubtreeKeys(model: CategoryTreeModel, rootKey: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const meta of model.index.values()) {
    if (meta.kind !== 'dimension' || meta.parentDimensionKey === null) continue
    const siblings = childrenOf.get(meta.parentDimensionKey)
    if (siblings) siblings.push(meta.key)
    else childrenOf.set(meta.parentDimensionKey, [meta.key])
  }

  const subtree = new Set<string>([rootKey])
  const queue = [rootKey]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const child of childrenOf.get(current) ?? []) {
      if (subtree.has(child)) continue
      subtree.add(child)
      queue.push(child)
    }
  }
  return subtree
}

export function buildCategoryTree(
  dimensions: CategoryDimension[],
  childrenByNode: ReadonlyMap<string, CategoryBrowseChild[]>,
): CategoryTreeModel {
  const index = new Map<string, CategoryNodeMeta>()

  function childNodes(parent: BrowseNodeRef, visited: ReadonlySet<string>): CategoryTreeNode[] {
    const children = childrenByNode.get(parent.key)
    if (children === undefined) {
      return [{ key: `${nodeKeyFor(parent.kind, parent.key)}${PENDING_SUFFIX}`, displayName: 'Loading…' }]
    }
    return children
      // Values form a DAG; guard against a cycle re-entering an ancestor of this branch.
      .filter((child) => !visited.has(child.value.key))
      .map((child) => {
        index.set(nodeKeyFor('value', child.value.key), {
          kind: 'value',
          key: child.value.key,
          displayName: child.value.displayName,
          dimensionKey: child.value.dimensionKey,
          accessLevel: child.value.accessLevel,
          parent,
          parentDimensionKey: null,
        })
        return {
          key: nodeKeyFor('value', child.value.key),
          displayName: child.value.displayName,
          dimensionKey: child.value.dimensionKey,
          atomCount: child.atomCount,
          children: childNodes(
            { kind: 'value', key: child.value.key },
            new Set([...visited, child.value.key]),
          ),
        }
      })
  }

  // Child dimensions grouped by parent key. A dimension is single-parent, so only the first entry
  // of parentDimensionKeys is honored; the list shape is the schema's DAG-ready form, not a v1
  // capability.
  const byParent = new Map<string, CategoryDimension[]>()
  const parentOf = new Map<string, string>()
  const byKey = new Map<string, CategoryDimension>()
  const present = new Set(dimensions.map((d) => d.key))
  const roots: CategoryDimension[] = []
  for (const dim of dimensions) {
    byKey.set(dim.key, dim)
    const parentKey = dim.parentDimensionKeys[0]
    // A parent outside the returned set (access-scoped away, or stale) makes this a root here —
    // otherwise the dimension would vanish from the rail entirely.
    if (parentKey !== undefined && parentKey !== dim.key && present.has(parentKey)) {
      parentOf.set(dim.key, parentKey)
      const siblings = byParent.get(parentKey)
      if (siblings) siblings.push(dim)
      else byParent.set(parentKey, [dim])
    } else {
      roots.push(dim)
    }
  }

  // Rendered exactly once, tracked across the WHOLE traversal rather than per branch. A dimension
  // has a single parent, so one appearance is always correct — and a global set is what makes the
  // cycle rescue below safe: a per-branch guard would let a dimension already rendered in one
  // branch render again in another (stale `c→a, a→b, b→a` produced c twice).
  const rendered = new Set<string>()

  function dimensionNodes(dims: CategoryDimension[], effectiveParentKey: string | null): CategoryTreeNode[] {
    return dims
      .filter((dim) => !rendered.has(dim.key))
      .map((dim) => {
        rendered.add(dim.key)
        index.set(nodeKeyFor('dimension', dim.key), {
          kind: 'dimension',
          key: dim.key,
          displayName: dim.displayName,
          dimensionKey: dim.key,
          accessLevel: dim.accessLevel,
          parent: null,
          // The parent it is actually rendered under, not what the data claims. These diverge on
          // stale cyclic or self-parented data, and the meta must match the tree — the re-parent
          // selector seeds from it while its options exclude the node's own subtree, so a claimed
          // parent that is not in the tree would preselect an option that does not exist.
          parentDimensionKey: effectiveParentKey,
        })
        return {
          key: nodeKeyFor('dimension', dim.key),
          displayName: dim.displayName,
          children: [
            // Structure first, then contents: child dimensions above this dimension's own values.
            ...dimensionNodes(byParent.get(dim.key) ?? [], dim.key),
            ...childNodes({ kind: 'dimension', key: dim.key }, new Set([dim.key])),
          ],
        }
      })
  }

  const nodes = dimensionNodes(roots, null)

  // Cycle rescue. If stale data presents A→B→A, neither is a root and both would silently vanish
  // from the rail. Anything not reached from a real root is promoted to one; `rendered` guarantees
  // its descendants are not re-emitted elsewhere.
  //
  // Promote a member OF the cycle, not whichever unrendered dimension happens to come first in the
  // array. A dependent hanging off a cycle (C under A, where A↔B) is not itself cyclic and has a
  // real parent — promoting it would hoist it to a root and report `parentDimensionKey: null`,
  // making the rendered tree depend on server row order for the same logical graph.
  for (const dim of dimensions) {
    if (rendered.has(dim.key)) continue
    let cursor = dim.key
    const walked = new Set<string>()
    while (!walked.has(cursor)) {
      walked.add(cursor)
      const next = parentOf.get(cursor)
      if (next === undefined || rendered.has(next)) break
      cursor = next
    }
    // `cursor` now sits inside the cycle; rendering it pulls its dependents into their real places.
    const entry = byKey.get(cursor)
    if (entry !== undefined && !rendered.has(entry.key)) nodes.push(...dimensionNodes([entry], null))
    if (!rendered.has(dim.key)) nodes.push(...dimensionNodes([dim], null))
  }

  return { nodes, index }
}
