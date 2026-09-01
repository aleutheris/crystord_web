import {
  collectRequiredConstants,
  LABELS_CONSTANT,
  DIMENSION_KEY_CONSTANT,
  VALUE_KEY_CONSTANT,
} from './operation-metadata'
import type { CollectEditorKind } from './operation-metadata'

/**
 * What a COLLECT save writes, and whether it may be written (EPIC-260082). Before this, the
 * builder always wrote `{ labels }` regardless of the selected query; now each registered query
 * contributes its own constants and is gated on its own declared requirements.
 */

/** A constants entry as a string; a number, object, or absent value reads as unset. */
export function stringConstant(raw: unknown): string {
  return typeof raw === 'string' ? raw : ''
}

/** Empty for gating purposes: an absent value, a blank string, or an empty list. */
export function isEmptyConstant(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0
  return value === undefined || value === null || value === ''
}

export interface CollectConstantsInput {
  labels: readonly string[]
  dimensionKey: string
  valueKey: string
}

/** The constants the selected query's editor produces — never the other editor's. */
export function buildCollectConstants(
  editor: CollectEditorKind,
  draft: CollectConstantsInput,
): Record<string, unknown> {
  if (editor === 'category') {
    return { [DIMENSION_KEY_CONSTANT]: draft.dimensionKey, [VALUE_KEY_CONSTANT]: draft.valueKey }
  }
  return { [LABELS_CONSTANT]: [...draft.labels] }
}

/**
 * Required constants the draft has not supplied. An unregistered (free-text) query declares
 * nothing, so it returns empty and stays saveable — exactly its pre-existing behaviour.
 */
export function missingCollectConstants(
  queryName: string,
  constants: Record<string, unknown>,
): string[] {
  return collectRequiredConstants(queryName).filter((key) => isEmptyConstant(constants[key]))
}

/**
 * Why the save is blocked. Both messages describe the SAME backend behaviour — since schema 9.3.0
 * an empty required constant fails evaluation with `OP-COLLECT-CONSTANTS-INVALID` and no query
 * runs (`user-guide.md:1305`) — and differ only in the action they ask for. Blocking here is still
 * worth doing: it stops the user saving an atom that is certain to come back failed.
 *
 * Earlier revisions claimed the label case would "collect every atom you own". That was true of
 * 9.2.0 and is now false; see `operation-metadata.ts` for why, and do not reinstate it.
 */
export function collectBlockMessage(missing: readonly string[]): string {
  if (missing.includes(LABELS_CONSTANT)) {
    return 'Add at least one label — this query cannot run with an empty filter.'
  }
  return 'Choose a category dimension and value — this query cannot run with an empty filter.'
}
