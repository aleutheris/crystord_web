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
  // Codes schema 9.3.0 documented. The COLLECT trio is new behaviour (user-guide.md:1305);
  // OP-OPERAND-TYPE-MISMATCH only got a NAME there (user-guide.md:1150) — the guide has listed
  // "type mismatch" as a failed-origin cause since before 9.3.0, and ADR-260065 §50-51 required
  // Explain to render that cause from EPIC-260069 on. It was never a 9.3.0 gap: it was unmapped
  // from the start, and a sweep scoped to "what 9.3.0 added" is why it stayed that way.
  'OP-COLLECT-CONSTANTS-MISSING': 'Collect setting missing',
  'OP-COLLECT-CONSTANTS-INVALID': 'Collect setting invalid',
  'OP-COLLECT-QUERY-UNKNOWN': 'Unknown collect query',
  'OP-OPERAND-TYPE-MISMATCH': 'Input type mismatch',
}

/**
 * This map is a best-effort translation, never a closed set: `errorCode` is an unenumerated
 * `String` (`schema.graphql:255`) and the guide carries no exhaustive code table, so the backend
 * can emit a code no reader of the guide could have listed. An unrecognized code is not an error
 * here — it falls through to the generic summary below, which is the designed behaviour.
 */

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
