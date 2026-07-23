import type { Atom, OperationPayload } from '../../api-contract'
import { collectQueryRequiresLabels, isCollectOperation } from './operation-metadata'

/**
 * Pure display helpers for the Compute tab (ADR-260065 / EPIC-260069): resolve payload
 * args to human-readable names and render the formula summary line — users never see the
 * raw JSON payload or raw UUIDs where a title is available.
 */

/** Shortened-UUID fallback for references outside the working set (e.g. `1c7b2b3d…`). */
export function shortUuid(value: string): string {
  return value.length > 8 ? `${value.slice(0, 8)}…` : value
}

/** Title of the atom with the given uuid, or undefined when outside the working set. */
export function atomTitle(uuid: string, atoms: readonly Atom[] | undefined): string | undefined {
  return atoms?.find((a) => a.properties.shellies.uuid === uuid)?.properties.nuclearies.title
}

/**
 * Resolve one arg for display: an atom title when the arg is a working-set UUID, the key
 * itself when it references the constants map, else the shortened UUID.
 */
export function describeArg(
  arg: string,
  atoms: readonly Atom[] | undefined,
  constants: Record<string, unknown> | null | undefined,
): string {
  const title = atomTitle(arg, atoms)
  if (title !== undefined) return title
  if (constants && arg in constants) return arg
  return shortUuid(arg)
}

/**
 * Formula summary line, e.g. `SUM(Alpha, taxRate)`.
 *
 * A label-consuming COLLECT also renders its `labels` constant — `COLLECT(atoms_with_labels →
 * Invoice)`. Without it the summary is identical whether labels are set or empty, which is how a
 * collect-everything formula stayed invisible after saving. Queries whose requirements we do not
 * know (free-text) render unchanged.
 */
export function formatFormula(
  payload: OperationPayload,
  atoms: readonly Atom[] | undefined,
  constants: Record<string, unknown> | null | undefined,
): string {
  if (isCollectOperation(payload.name)) return formatCollect(payload, constants)
  const parts = payload.args.map((arg) => describeArg(arg, atoms, constants))
  return `${payload.name}(${parts.join(', ')})`
}

/**
 * COLLECT's arg is a registered query NAME, not an atom reference — so it renders verbatim
 * rather than through `describeArg`, which would shorten it like an out-of-set UUID
 * (`atoms_with_labels` → `atoms_wi…`).
 */
function formatCollect(
  payload: OperationPayload,
  constants: Record<string, unknown> | null | undefined,
): string {
  const query = payload.args[0] ?? ''
  if (!collectQueryRequiresLabels(query)) return `${payload.name}(${payload.args.join(', ')})`
  const labels = collectedLabels(constants)
  return `${payload.name}(${query} → ${labels.length > 0 ? labels.join(', ') : 'no labels'})`
}

/** The `labels` constant as a string list; anything else reads as no labels. */
function collectedLabels(constants: Record<string, unknown> | null | undefined): string[] {
  const raw = constants?.['labels']
  return Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : []
}

/** Count of args that are inputs (not constant keys) — the N in "computed from N inputs". */
export function countInputArgs(
  payload: OperationPayload,
  constants: Record<string, unknown> | null | undefined,
): number {
  return payload.args.filter((arg) => !(constants && arg in constants)).length
}

/** Numeric-looking constant values are stored as numbers, everything else as strings. */
export function constantValue(raw: string): number | string {
  const trimmed = raw.trim()
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : raw
}
