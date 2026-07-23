import type { OperationFunction } from '../../api-contract'

/**
 * Client-side metadata for the built-in operations (ADR-260065 / EPIC-260069).
 * `discoverOperations` exposes NO arity/type metadata (name + description only), so the
 * builder carries this table; unknown operation names fall back to a generic variadic
 * editor via `argBounds` rather than being blocked.
 */

export interface ArgBounds {
  min: number
  /** Undefined = unbounded (variadic). */
  max?: number
}

interface BuiltinOperation extends ArgBounds {
  /** COLLECT is special-cased: its single arg is a registered query name, not an atom/constant. */
  collect?: boolean
}

export const BUILTIN_OPERATIONS: Record<string, BuiltinOperation> = {
  SUM: { min: 1 },
  MINUS: { min: 2, max: 2 },
  PRODUCT: { min: 2 },
  DIVIDE: { min: 2, max: 2 },
  COLLECT: { min: 1, max: 1, collect: true },
}

/**
 * Registered COLLECT queries and the constants each one requires (label-only until the backend
 * adds category collect). Same client-side-table compromise as `BUILTIN_OPERATIONS` above:
 * `discoverOperations` exposes no constants metadata, so the builder carries the requirement.
 *
 * `requiresLabels` is a correctness gate, not a convenience check. `atoms_with_labels` ANDs the
 * requested labels, and an empty list is vacuously true server-side — it matches EVERY atom the
 * caller owns rather than none. An unenforced empty `labels` therefore silently writes a
 * collect-everything result, so the builder must refuse the save (ADR-260027 D2 rationale).
 */
interface CollectQuerySpec {
  name: string
  requiresLabels: boolean
}

const COLLECT_QUERY_SPECS: readonly CollectQuerySpec[] = [
  { name: 'atoms_with_labels', requiresLabels: true },
]

/** Registered COLLECT query names. */
export const COLLECT_QUERIES: readonly string[] = COLLECT_QUERY_SPECS.map((q) => q.name)

/**
 * Whether the query cannot run without at least one label. Unregistered (free-text) queries
 * return `false` — we only know the requirements of queries we ship in the table.
 */
export function collectQueryRequiresLabels(name: string): boolean {
  return COLLECT_QUERY_SPECS.find((q) => q.name === name)?.requiresLabels ?? false
}

/** Arg bounds for an operation; unknown names get the generic variadic fallback. */
export function argBounds(name: string): ArgBounds {
  return BUILTIN_OPERATIONS[name] ?? { min: 0 }
}

export function isCollectOperation(name: string): boolean {
  return BUILTIN_OPERATIONS[name]?.collect === true
}

/** Offline/failure fallback catalog — the builder must work from the registry alone. */
export const FALLBACK_OPERATIONS: readonly OperationFunction[] = [
  { name: 'SUM', description: 'Add the inputs together.' },
  { name: 'MINUS', description: 'Subtract the second input from the first.' },
  { name: 'PRODUCT', description: 'Multiply the inputs.' },
  { name: 'DIVIDE', description: 'Divide the first input by the second.' },
  { name: 'COLLECT', description: 'Collect atoms via a registered query.' },
]
