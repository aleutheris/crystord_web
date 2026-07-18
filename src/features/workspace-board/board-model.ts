import type { Atom } from '../../api-contract'
import type { CategoryValue } from '../../api-contract/category-operations'

/**
 * Pure board derivation helpers (ADR-260070 / EPIC-260075): columns are the chosen
 * dimension's ROOT values plus a leading Unassigned bucket; an atom lands in a root column
 * when its assignment in the dimension is that root or any descendant of it (client-side
 * rollup over the dimension's full value list). Parent walking follows the buildValueTree
 * precedent: a missing parent makes a value a root, and cycles never recurse.
 */

/** Column key of the leading bucket for atoms without a placeable assignment. */
export const UNASSIGNED = '__unassigned__'

export interface BoardColumnDef {
  key: string
  displayName: string
}

/** Root values in stable input order — a value with no LOADED parent counts as a root. */
export function deriveColumns(values: readonly CategoryValue[]): BoardColumnDef[] {
  const loaded = new Set(values.map((v) => v.key))
  return values
    .filter((v) => !v.parentValueKeys.some((p) => loaded.has(p)))
    .map((v) => ({ key: v.key, displayName: v.displayName }))
}

/**
 * Map every value key to its root ancestor by walking first-loaded-parent links upward.
 * Cycle-safe: revisiting a key stops the walk, so a cycle-locked value maps to another
 * cycle member (never itself) — `columnAssignments` detects that and treats the
 * assignment as unplaceable, mirroring buildValueTree dropping cycle-only nodes.
 */
export function rootAncestorMap(values: readonly CategoryValue[]): Map<string, string> {
  const byKey = new Map(values.map((v) => [v.key, v]))
  const map = new Map<string, string>()
  for (const value of values) {
    let current = value
    const visited = new Set<string>([value.key])
    for (;;) {
      const parentKey = current.parentValueKeys.find((p) => byKey.has(p))
      if (parentKey === undefined || visited.has(parentKey)) break
      visited.add(parentKey)
      current = byKey.get(parentKey)!
    }
    map.set(value.key, current.key)
  }
  return map
}

/**
 * Bucket atoms into columns: the Unassigned bucket first, then one bucket per root that
 * received cards. Multiple assignments in the dimension put the SAME atom in each matching
 * column (a fact of the data model, rendered honestly — ADR-260070). An atom whose
 * assignments are all unplaceable (unknown value, or cycle-locked) lands in Unassigned.
 */
export function columnAssignments(
  atoms: readonly Atom[],
  dimensionKey: string,
  rootMap: ReadonlyMap<string, string>,
): Map<string, Atom[]> {
  const buckets = new Map<string, Atom[]>([[UNASSIGNED, []]])
  for (const atom of atoms) {
    const roots = new Set<string>()
    for (const assignment of atom.categories ?? []) {
      if (assignment.dimensionKey !== dimensionKey) continue
      const root = rootMap.get(assignment.valueKey)
      // A true root maps to itself; anything else (unknown key, cycle member) is unplaceable.
      if (root !== undefined && rootMap.get(root) === root) roots.add(root)
    }
    for (const key of roots.size > 0 ? [...roots] : [UNASSIGNED]) {
      const bucket = buckets.get(key)
      if (bucket) {
        bucket.push(atom)
      } else {
        buckets.set(key, [atom])
      }
    }
  }
  return buckets
}

/**
 * Pure recategorize builder: replace THIS dimension's assignments with the single root
 * (`null` clears the dimension); every other dimension's assignments are preserved.
 * Always yields a `categories` array so `updateAtom` sends the replace-all field.
 */
export function recategorized(atom: Atom, dimensionKey: string, rootKey: string | null): Atom {
  const others = (atom.categories ?? []).filter((c) => c.dimensionKey !== dimensionKey)
  const categories = rootKey === null ? others : [...others, { dimensionKey, valueKey: rootKey }]
  return { ...atom, categories }
}

/**
 * True when a move would rewrite the atom's assignments in the dimension to what they
 * already are — exactly the target root, or already unassigned. Deliberately NOT a
 * same-column check: an atom shown under its root via a DESCENDANT assignment is coarsened
 * to the root when dropped there (ADR-260070 consequence), so that move must go through.
 */
export function isNoopMove(atom: Atom, dimensionKey: string, rootKey: string | null): boolean {
  const mine = (atom.categories ?? []).filter((c) => c.dimensionKey === dimensionKey)
  if (rootKey === null) return mine.length === 0
  return mine.length === 1 && mine[0]!.valueKey === rootKey
}
