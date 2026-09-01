import { useState } from 'react'
import type { OperationPayload } from '../../api-contract'
import {
  collectQueryEditor,
  isCollectOperation,
  COLLECT_QUERIES,
  OTHER_QUERY,
  DIMENSION_KEY_CONSTANT,
  VALUE_KEY_CONSTANT,
  LABELS_CONSTANT,
} from './operation-metadata'
import type { CollectEditorKind } from './operation-metadata'
import { buildCollectConstants, missingCollectConstants, stringConstant } from './collect-constants'
import { isUnusableValue, markUnusableValues, optionsWithSelected } from './category-option-list'
import type { CategoryOption } from './category-option-list'
import { useCategoryOptions } from './use-category-options'

export interface CollectDraft {
  /** The picker's selection — a registered query name, or the free-text sentinel. */
  choice: string
  customQuery: string
  /** The resolved query name the payload will carry (the custom box wins under `other…`). */
  queryName: string
  editor: CollectEditorKind
  labels: string[]
  dimensionKey: string
  valueKey: string
  /** Exactly the constants the selected query's editor produces. */
  constants: Record<string, unknown>
  /** Required constants still unsupplied; empty means the save may proceed. */
  missing: string[]
  /** Dropdown-ready taxonomy for the category editor, already sticky- and ownership-marked. */
  dimensionOptions: CategoryOption[]
  valueOptions: CategoryOption[]
  categoriesLoading: boolean
  categoriesError: string | null
  /** A list the server cut off at its page ceiling — the remainder is unreachable here. */
  dimensionsTruncated: boolean
  valuesTruncated: boolean
  /**
   * The selected value exists but the caller does not own it, so the query cannot resolve it —
   * the save must be blocked rather than write a formula that collects nothing.
   */
  valueUnusable: boolean
  changeChoice: (next: string) => void
  changeCustomQuery: (next: string) => void
  addLabel: (label: string) => void
  removeLabel: (label: string) => void
  setLabelDraft: (draft: string) => void
  changeDimension: (key: string) => void
  changeValue: (key: string) => void
  /** Forget an uncommitted chip draft — call when the label editor is about to unmount. */
  dropLabelDraft: () => void
}

/**
 * The COLLECT argument draft (EPIC-260069, extended by EPIC-260082): the query selection plus
 * whichever constants that query needs, and the gate over its declared requirements.
 *
 * Lives outside `FormulaBuilder` because COLLECT owns six pieces of interdependent state whose
 * transitions carry the real correctness rules — which constants a save writes, and when an
 * uncommitted chip draft must be forgotten.
 *
 * `collectSelected` is whether COLLECT is the operation currently picked. Required, not defaulted:
 * the draft's own state cannot tell whether its editor is on screen (see the taxonomy gate below),
 * and a default would hide that from the one caller that knows.
 */
export function useCollectDraft(
  initial: OperationPayload | null,
  initialConstants: Record<string, unknown>,
  collectSelected: boolean,
): CollectDraft {
  const initialArg = initial && isCollectOperation(initial.name) ? initial.args[0] ?? '' : ''

  const [choice, setChoice] = useState(
    initialArg !== '' && !COLLECT_QUERIES.includes(initialArg) ? OTHER_QUERY : (initialArg || COLLECT_QUERIES[0]!),
  )
  const [customQuery, setCustomQuery] = useState(COLLECT_QUERIES.includes(initialArg) ? '' : initialArg)
  const [labels, setLabels] = useState<string[]>(() => {
    const raw = initialConstants[LABELS_CONSTANT]
    return Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : []
  })
  // Uncommitted chip-editor text (the DetailPanel creation-form pattern). A chip only exists
  // after Enter, so a user who typed a label and clicked Save formula would otherwise ship
  // `labels: []` — which since 9.3.0 fails evaluation outright (`OP-COLLECT-CONSTANTS-INVALID`,
  // user-guide.md:1305). ADR-260027 D2's auto-chip BEHAVIOUR is what applies here; its
  // "empty means all atoms" rationale belongs to the search path — see `operation-metadata.ts`.
  const [labelDraft, setLabelDraft] = useState('')
  const [dimensionKey, setDimensionKey] = useState(() => stringConstant(initialConstants[DIMENSION_KEY_CONSTANT]))
  const [valueKey, setValueKey] = useState(() => stringConstant(initialConstants[VALUE_KEY_CONSTANT]))

  const queryName = choice === OTHER_QUERY ? customQuery.trim() : choice
  const editor = collectQueryEditor(queryName)

  // What the save would actually send: committed chips plus any typed-but-uncommitted text.
  const pendingLabel = labelDraft.trim()
  const effectiveLabels = pendingLabel && !labels.includes(pendingLabel) ? [...labels, pendingLabel] : labels

  const constants = buildCollectConstants(editor, { labels: effectiveLabels, dimensionKey, valueKey })

  // Whether the category pickers are actually on screen. `editor` alone does not answer that: it
  // is derived from the QUERY NAME, so an atom that arrived as a category COLLECT still reports
  // `editor === 'category'` after the operation picker moves to SUM, where nothing renders it.
  //
  // Nothing observable rides on this today — `useCategoryOptions` dedupes per mount, so a
  // wrongly-armed flag issues no second read, and `FormulaBuilder` reads `valueUnusable` only
  // inside its own `collect` branch. Both of those are the CALLER being careful, which is exactly
  // what round 15 declined to rely on when it made the save gate check the editor explicitly. One
  // named condition, so the two consumers below cannot drift into different answers.
  const categoryEditorActive = collectSelected && editor === 'category'

  // Only the category editor needs the taxonomy, so picking `atoms_with_labels` costs no query.
  const categories = useCategoryOptions(dimensionKey, categoryEditorActive)
  const dimensionOptions = optionsWithSelected(categories.dimensions, dimensionKey, categories.dimensionsAuthoritative)
  const valueOptions = optionsWithSelected(
    markUnusableValues(categories.values),
    valueKey,
    categories.valuesAuthoritative,
  )

  /**
   * `LabelChipEditor` keeps its input in its OWN state and reports changes only while mounted —
   * it comes back empty after an editor swap without ever saying so, and a draft left behind here
   * would be saved as a label the user can no longer see (and would wrongly satisfy the
   * empty-labels gate). Dropped only on an actual swap, so the D2 rule above is untouched.
   */
  function dropLabelDraft() {
    setLabelDraft('')
  }

  function swapsEditor(nextQuery: string): boolean {
    return collectQueryEditor(nextQuery) !== editor
  }

  return {
    choice,
    customQuery,
    queryName,
    editor,
    labels,
    dimensionKey,
    valueKey,
    constants,
    missing: missingCollectConstants(queryName, constants),
    dimensionOptions,
    valueOptions,
    categoriesLoading: categories.loading,
    categoriesError: categories.error,
    dimensionsTruncated: categories.dimensionsTruncated,
    valuesTruncated: categories.valuesTruncated,
    valueUnusable: categoryEditorActive && isUnusableValue(valueOptions, valueKey),
    changeChoice: (next) => {
      if (swapsEditor(next === OTHER_QUERY ? customQuery.trim() : next)) dropLabelDraft()
      setChoice(next)
    },
    changeCustomQuery: (next) => {
      if (swapsEditor(next.trim())) dropLabelDraft()
      setCustomQuery(next)
    },
    addLabel: (label) => setLabels((prev) => [...prev, label]),
    removeLabel: (label) => setLabels((prev) => prev.filter((l) => l !== label)),
    setLabelDraft,
    // A value never survives its dimension — it does not exist under the new one.
    changeDimension: (key) => { setDimensionKey(key); setValueKey('') },
    changeValue: setValueKey,
    dropLabelDraft,
  }
}
