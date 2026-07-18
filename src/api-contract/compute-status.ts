import type { Atom } from './graph-queries'

/**
 * Badge model folded from the untyped evaluation fields (ADR-260065 / EPIC-260069),
 * consumable by both the Compute tab and the Flow view's badges region.
 */
export interface ComputeStatus {
  kind: 'ok' | 'error' | 'skipped'
  summary: string
}

/** Plain-language summaries for the documented failure codes (calm competence). */
const ERROR_SUMMARIES: Record<string, string> = {
  'AU-CYCLE-DETECTED': 'Dependency cycle',
  'OP-DIVISION-BY-ZERO': 'Division by zero',
  'AU-DEPENDENCY-MISSING': 'Missing dependency',
  'OP-SIG-SHAPE-MISMATCH': 'Shape mismatch',
}

/**
 * Folds an atom's evaluation fields into a badge, or `undefined` for no badge.
 *
 * - `failed-origin` / `failed-propagated` → error regardless of `operation` (a stale failure
 *   report still deserves surfacing); the summary comes from `errorCode`, with 'An input
 *   failed' for propagated failures and 'Computation failed' for unknown codes.
 * - `skipped-optional` → skipped.
 * - `success` → ok, but only for atoms that actually carry an operation — a manual atom
 *   reporting success gets no badge.
 * - Absent or unknown `evaluationStatus` values → `undefined` (untyped strings; never guess).
 */
export function computeStatusFor(atom: Atom): ComputeStatus | undefined {
  const status = atom.evaluationStatus
  if (status === 'failed-origin' || status === 'failed-propagated') {
    const code = atom.errorCode
    const summary =
      (code && ERROR_SUMMARIES[code]) ??
      (status === 'failed-propagated' ? 'An input failed' : 'Computation failed')
    return { kind: 'error', summary }
  }
  if (status === 'skipped-optional') {
    return { kind: 'skipped', summary: 'Skipped — optional input absent' }
  }
  if (status === 'success' && atom.properties.nuclearies.operation) {
    return { kind: 'ok', summary: 'Up to date' }
  }
  return undefined
}
