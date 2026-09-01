import type { OperationFunction } from '../../api-contract'

/**
 * Client-side metadata for the built-in operations (ADR-260065 / EPIC-260069).
 *
 * **Schema 9.3.0 publishes this metadata** — `OperationFunction` carries `minArity`, `maxArity`
 * (null = unbounded) and `numericOnly` (`schema.graphql:80-84`, `user-guide.md:251`), granting the
 * second backend ask LRN-003 §7 recorded as unfiled. The builder does **not** read them yet:
 * `DISCOVER_OPERATIONS_QUERY` selects `name`/`description` only, and adding fields would widen the
 * frontend's used surface inside the pinned schema — the same ICR question EPIC-260082 deferred
 * `collectQueries` to avoid. So this table is a hand-maintained COPY of a contract the server now
 * publishes, not the only place the knowledge exists. Earlier revisions of this comment claimed the
 * server exposed nothing; that was true of 9.2.0 and is false now.
 *
 * **Known consequence of not reading it** (deliberate, recorded in EPIC-260082): an operation the
 * server registers but this table does not list falls to `argBounds`'s `{ min: 0 }` fallback, so
 * `fitRows` pads no slots and `FormulaBuilder`'s empty-slot check finds nothing to block — the
 * builder will save `args: []` for an operation whose real `minArity` is higher, and `numericOnly`
 * is never enforced. The fallback stays permissive rather than guessing a minimum the server
 * already knows: closing this properly means reading the published fields, which is the follow-up.
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
 * Sentinel for the free-text COLLECT query option. It keeps a user reachable to a query the
 * backend has registered but this table does not list yet — including, eventually, a combined
 * labels+category query (EPIC-260082 records why one cannot exist today).
 */
export const OTHER_QUERY = '__other__'

/** Constants keys the registered COLLECT queries consume (backend vocabulary — snake_case). */
export const LABELS_CONSTANT = 'labels'
export const DIMENSION_KEY_CONSTANT = 'dimension_key'
export const VALUE_KEY_CONSTANT = 'value_key'

/**
 * Constants owned by a COLLECT query's own editor. They never appear in the generic key/value
 * constants editor: that editor is for constants the user manages by hand, and a COLLECT's
 * parameters are managed by its query editor instead. `labels` has always been excluded this
 * way — the category keys join it so converting a category COLLECT to SUM does not leak
 * `dimension_key`/`value_key` in as hand-edited rows.
 */
export const COLLECT_OWNED_CONSTANTS: readonly string[] = [
  LABELS_CONSTANT,
  DIMENSION_KEY_CONSTANT,
  VALUE_KEY_CONSTANT,
]

/** Which constants editor the builder shows for a query. */
export type CollectEditorKind = 'labels' | 'category'

/**
 * Registered COLLECT queries: their picker text, the constants each cannot run without, and the
 * editor that supplies them (EPIC-260082). Same client-side-table compromise as
 * `BUILTIN_OPERATIONS` above — `discoverOperations` exposes no constants metadata, so the builder
 * carries the requirement. Schema 9.3.0 also publishes this registry live via `collectQueries`
 * (name + description + each constant's type/minItems); consuming it is EPIC-260082's recorded
 * follow-up, deferred so the frontend's used surface — and the ICR question with it — stays put.
 *
 * `requiredConstants` is a correctness gate, not a convenience check — but note **what it now
 * guards, which is not what it guarded before schema 9.3.0.** The backend validates required
 * constants itself: absent → `OP-COLLECT-CONSTANTS-MISSING`, present-but-empty/wrong-type/below
 * `minItems` → `OP-COLLECT-CONSTANTS-INVALID`, and in both cases "no query runs and no rows are
 * returned — an empty filter never means 'match everything'" (`user-guide.md:1305`, new in 9.3.0;
 * it granted the backend ask LRN-003 §7 recorded as unfiled). So an empty `labels` list no longer
 * collects every atom the caller owns; it fails evaluation loudly.
 *
 * The gate therefore stops the user shipping an atom that is **certain to fail evaluation** — a
 * better outcome than a red status badge — and it applies identically to both query families. The
 * two block messages differ only in the ACTION they ask for, not in the hazard behind them.
 *
 * Do not re-import ADR-260027 D2's "empty means all atoms" reasoning here: that is true of the
 * SEARCH path (`retrieve`), where D2 prevents accidental all-atom searches, and was transplanted
 * onto COLLECT in error. D2's auto-chip *behaviour* still applies — an uncommitted draft is what
 * the user meant to type — only its hazard rationale does not.
 *
 * The genuinely asymmetric case is elsewhere: a NON-empty but unowned `value_key` passes the
 * backend's validation, runs, and returns an empty list — succeeding silently. That is the one
 * COLLECT path that can still be quietly wrong, and it is gated separately on `accessLevel`.
 */
export interface CollectQuerySpec {
  name: string
  /** Picker text: the registry name is server vocabulary, not user vocabulary. */
  label: string
  requiredConstants: readonly string[]
  editor: CollectEditorKind
}

const COLLECT_QUERY_SPECS: readonly CollectQuerySpec[] = [
  // `atoms_with_labels` stays first — it is the builder's default selection.
  {
    name: 'atoms_with_labels',
    label: 'Atoms with all of these labels',
    requiredConstants: [LABELS_CONSTANT],
    editor: 'labels',
  },
  {
    name: 'atoms_in_category_value',
    label: 'Atoms at this category value',
    requiredConstants: [DIMENSION_KEY_CONSTANT, VALUE_KEY_CONSTANT],
    editor: 'category',
  },
  {
    name: 'atoms_in_category_subtree',
    label: 'Atoms at this category value and everything beneath it',
    requiredConstants: [DIMENSION_KEY_CONSTANT, VALUE_KEY_CONSTANT],
    editor: 'category',
  },
]

/** Registered COLLECT query names. */
export const COLLECT_QUERIES: readonly string[] = COLLECT_QUERY_SPECS.map((q) => q.name)

/** The registered queries, for rendering the picker with human-readable text. */
export const COLLECT_QUERY_OPTIONS: readonly CollectQuerySpec[] = COLLECT_QUERY_SPECS

/** The spec for a registered query; `undefined` for an unregistered (free-text) name. */
export function collectQuerySpec(name: string): CollectQuerySpec | undefined {
  return COLLECT_QUERY_SPECS.find((q) => q.name === name)
}

/**
 * Constants the query cannot run without. Unregistered (free-text) queries return an empty
 * list — we only know the requirements of queries we ship in the table, and gating on a
 * requirement we cannot know would block a legitimate future registration.
 */
export function collectRequiredConstants(name: string): readonly string[] {
  return collectQuerySpec(name)?.requiredConstants ?? []
}

/**
 * Which constants editor to show. Unregistered queries keep the labels editor — that is what
 * they have always had, and changing it would drop the only constants affordance they have.
 */
export function collectQueryEditor(name: string): CollectEditorKind {
  return collectQuerySpec(name)?.editor ?? 'labels'
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
