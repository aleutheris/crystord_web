import type { AtomCategoryAssignment } from '../../api-contract/graph-queries'
import type { CategoryValue } from '../../api-contract/category-operations'
import type { CategoryTreeNode } from '../../ui-primitives'

/**
 * Pure display helpers for the Classify tab's category chips and pick tree (ADR-260063).
 * Keys fall back where taxonomy metadata is missing or still loading — the chip is never blank.
 */

/** Group the atom's assignments by dimension, preserving first-seen dimension order. */
export function groupAssignmentsByDimension(
  assignments: readonly AtomCategoryAssignment[],
): Map<string, AtomCategoryAssignment[]> {
  const groups = new Map<string, AtomCategoryAssignment[]>()
  for (const assignment of assignments) {
    const group = groups.get(assignment.dimensionKey)
    if (group) {
      group.push(assignment)
    } else {
      groups.set(assignment.dimensionKey, [assignment])
    }
  }
  return groups
}

/** The value's display name, falling back to the raw key while values load (or if unknown). */
export function valueDisplayName(valueKey: string, values: readonly CategoryValue[] | undefined): string {
  return (values ?? []).find((v) => v.key === valueKey)?.displayName ?? valueKey
}

/**
 * The full ancestor path for the chip tooltip, e.g. `Region ▸ Europe ▸ Belgium` — derived
 * client-side by walking first `parentValueKeys` links. Stops on a missing parent and guards
 * against cycles; falls back to the raw key while values are loading.
 */
export function buildCategoryPath(
  dimensionName: string,
  valueKey: string,
  values: readonly CategoryValue[] | undefined,
): string {
  const byKey = new Map((values ?? []).map((v) => [v.key, v]))
  let current = byKey.get(valueKey)
  if (!current) return `${dimensionName} ▸ ${valueKey}`

  const segments: string[] = []
  const visited = new Set<string>()
  while (current && !visited.has(current.key)) {
    visited.add(current.key)
    segments.unshift(current.displayName)
    const parentKey: string | undefined = current.parentValueKeys[0]
    current = parentKey === undefined ? undefined : byKey.get(parentKey)
  }
  return [dimensionName, ...segments].join(' ▸ ')
}

/**
 * Build the pick-mode tree for one dimension's values: roots are values without a loaded parent
 * (empty `parentValueKeys` or none of the parents present — a value whose parent is missing is
 * treated as a root); every other value nests under its first loaded parent. Values only
 * reachable through a cycle (schema-invalid) are simply dropped rather than recursing.
 */
export function buildValueTree(values: readonly CategoryValue[]): CategoryTreeNode[] {
  const byKey = new Map(values.map((v) => [v.key, v]))
  const childKeys = new Map<string, string[]>()
  const roots: CategoryValue[] = []
  for (const value of values) {
    const parentKey = value.parentValueKeys.find((p) => byKey.has(p))
    if (parentKey === undefined) {
      roots.push(value)
      continue
    }
    const siblings = childKeys.get(parentKey)
    if (siblings) {
      siblings.push(value.key)
    } else {
      childKeys.set(parentKey, [value.key])
    }
  }

  function toNode(value: CategoryValue): CategoryTreeNode {
    const children = (childKeys.get(value.key) ?? []).map((key) => toNode(byKey.get(key)!))
    return {
      key: value.key,
      displayName: value.displayName,
      dimensionKey: value.dimensionKey,
      ...(children.length > 0 ? { children } : {}),
    }
  }
  return roots.map(toNode)
}
