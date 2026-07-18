import type { Atom, OperationPayload } from '../../api-contract'

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

/** Formula summary line, e.g. `SUM(Alpha, taxRate)`. */
export function formatFormula(
  payload: OperationPayload,
  atoms: readonly Atom[] | undefined,
  constants: Record<string, unknown> | null | undefined,
): string {
  const parts = payload.args.map((arg) => describeArg(arg, atoms, constants))
  return `${payload.name}(${parts.join(', ')})`
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
