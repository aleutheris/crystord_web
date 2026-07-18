import type { CategoryBrowseChild, CategoryDimension } from '../../api-contract'
import type { CategoryTreeNode } from '../../ui-primitives'

/**
 * Pure tree-model builder for the Categories navigator (ADR-260064): top level = dimensions,
 * values from the per-node browse cache. Unbrowsed nodes get a synthetic "Loading…" child so
 * the shared CategoryTree shows an expand affordance before the lazy load has run.
 */

const PENDING_SUFFIX = '##pending'

/** True for the synthetic placeholder child of a not-yet-browsed node. */
export function isPendingKey(key: string): boolean {
  return key.endsWith(PENDING_SUFFIX)
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
  /** The node whose browse cache lists this node (null for dimensions). */
  parent: BrowseNodeRef | null
}

export interface CategoryTreeModel {
  nodes: CategoryTreeNode[]
  index: ReadonlyMap<string, CategoryNodeMeta>
}

export function buildCategoryTree(
  dimensions: CategoryDimension[],
  childrenByNode: ReadonlyMap<string, CategoryBrowseChild[]>,
): CategoryTreeModel {
  const index = new Map<string, CategoryNodeMeta>()

  function childNodes(parent: BrowseNodeRef, visited: ReadonlySet<string>): CategoryTreeNode[] {
    const children = childrenByNode.get(parent.key)
    if (children === undefined) {
      return [{ key: `${parent.key}${PENDING_SUFFIX}`, displayName: 'Loading…' }]
    }
    return children
      // Values form a DAG; guard against a cycle re-entering an ancestor of this branch.
      .filter((child) => !visited.has(child.value.key))
      .map((child) => {
        index.set(child.value.key, {
          kind: 'value',
          key: child.value.key,
          displayName: child.value.displayName,
          dimensionKey: child.value.dimensionKey,
          accessLevel: child.value.accessLevel,
          parent,
        })
        return {
          key: child.value.key,
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

  const nodes = dimensions.map((dim) => {
    index.set(dim.key, {
      kind: 'dimension',
      key: dim.key,
      displayName: dim.displayName,
      dimensionKey: dim.key,
      accessLevel: dim.accessLevel,
      parent: null,
    })
    return {
      key: dim.key,
      displayName: dim.displayName,
      children: childNodes({ kind: 'dimension', key: dim.key }, new Set([dim.key])),
    }
  })

  return { nodes, index }
}
