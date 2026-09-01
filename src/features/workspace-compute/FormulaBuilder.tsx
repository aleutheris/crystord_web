import { useState } from 'react'
import type { Atom, OperationPayload } from '../../api-contract'
import { C_TEXT_SECONDARY, C_ERROR } from '../../styles/tokens'
import { argBounds, isCollectOperation, COLLECT_OWNED_CONSTANTS } from './operation-metadata'
import type { ArgBounds } from './operation-metadata'
import { collectBlockMessage } from './collect-constants'
import { useCollectDraft } from './use-collect-draft'
import { ArgSlots } from './ArgSlots'
import type { ArgSlotRow } from './ArgSlots'
import { CollectEditor } from './CollectEditor'
import { ConstantsEditor } from './ConstantsEditor'
import type { ConstantEntry } from './ConstantsEditor'
import { constantValue } from './formula-format'
import { useOperations } from './use-operations'

interface FormulaBuilderProps {
  initial: OperationPayload | null
  initialConstants: Record<string, unknown>
  atoms: Atom[]
  saving: boolean
  onSave: (payload: OperationPayload, constants: Record<string, unknown>) => void
  onCancel: () => void
}

/** Fit rows to the operation's arity: trim above max, pad to min with empty atom slots. */
function fitRows(rows: ArgSlotRow[], bounds: ArgBounds): ArgSlotRow[] {
  const fitted = bounds.max !== undefined ? rows.slice(0, bounds.max) : rows.slice()
  while (fitted.length < bounds.min) fitted.push({ source: 'atom', value: '' })
  return fitted
}

/**
 * The formula builder (ADR-260065 / EPIC-260069): operation picker from discovery, arg
 * slots within the client-side arity table, constants, and COLLECT's query + labels —
 * users never type the JSON payload.
 */
export function FormulaBuilder({ initial, initialConstants, atoms, saving, onSave, onCancel }: FormulaBuilderProps) {
  const { operations } = useOperations()
  const initialName = initial?.name ?? 'SUM'

  const [name, setName] = useState(initialName)
  const [rows, setRows] = useState<ArgSlotRow[]>(() => fitRows(
    initial && !isCollectOperation(initial.name)
      ? initial.args.map((arg) => ({ source: arg in initialConstants ? 'constant' as const : 'atom' as const, value: arg }))
      : [],
    argBounds(initialName),
  ))
  // Declared ahead of the draft because the draft's lazy taxonomy fetch is gated on it: the
  // selected COLLECT query cannot tell the hook whether its category editor is still rendered.
  const collect = isCollectOperation(name)
  const draft = useCollectDraft(initial, initialConstants, collect)
  // Whether the atom ARRIVED as a COLLECT — fixed for the life of the mount, and the only case in
  // which `dimension_key`/`value_key`/`labels` belong to the query editor rather than to the user.
  // Reserving those names globally would strip a hand-authored constant of the same name off a
  // plain SUM: it would vanish from the editor, dangle any arg referencing it, and be dropped on
  // save. They are plausible user names in a taxonomy-heavy product, so scope the reservation.
  const collectInitially = initial !== null && isCollectOperation(initial.name)
  const [entries, setEntries] = useState<ConstantEntry[]>(() =>
    Object.entries(initialConstants)
      .filter(([key]) => !collectInitially || !COLLECT_OWNED_CONSTANTS.includes(key))
      .map(([key, value]) => ({ key, value: String(value) })))

  // A previously saved unknown operation stays selectable even if discovery doesn't list it.
  const options = operations.some((op) => op.name === name)
    ? operations
    : [{ name, description: '' }, ...operations]
  const description = options.find((op) => op.name === name)?.description
  const constantKeys = [...new Set(entries.map((e) => e.key.trim()).filter((k) => k !== ''))]

  // Save gating with a reason (never a silently dead button). Arity minimums are enforced
  // structurally — rows are padded to min — so an unmet arity shows up as an empty slot.
  const blockReason = collect
    ? draft.queryName === ''
      ? 'Enter the collect query name.'
      : draft.missing.length > 0
        ? collectBlockMessage(draft.missing)
        // `valueUnusable` is data-dependent, and the data is not here yet: mid-load the value
        // list is empty, so a stored key falls to the sticky option, which carries no access
        // information and reads as usable. Saving inside that window would slip an unownable
        // value past the check below — and re-opening an atom that already collects nothing is
        // exactly when that check earns its keep. Costs nothing for fresh authoring: an unset
        // value is already blocked above, so this only bites while a STORED one is being verified.
        //
        // KNOWN GAP (recorded, not closed here): loading is only one of three ways the value list
        // can lack access data. A values load that FAILED, or a page full at the ceiling, both
        // leave `loading === false` with the stored key on the unflagged sticky option, so
        // `valueUnusable` reads false and the save is released without the value being verified.
        // Gating on `valuesAuthoritative` instead would close the failure case but permanently
        // strand any stored value past the ceiling, contradicting the recorded "unresolvable
        // stored key does not block save" decision. A design call, not a wider condition — see
        // EPIC-260082 §Implementation Notes finding 17.
        : draft.editor === 'category' && draft.categoriesLoading
          ? 'Checking the selected category value…'
          : draft.valueUnusable
            ? 'Choose a category value you own — this query cannot resolve a value shared with you, so it would collect nothing.'
            : null
    : rows.some((r) => r.value === '')
      ? 'Fill every argument slot.'
      : rows.some((r) => r.source === 'constant' && !constantKeys.includes(r.value))
        ? 'A constant argument references a key that no longer exists.'
        : null

  function changeOperation(next: string) {
    setName(next)
    if (!isCollectOperation(next)) {
      setRows((prev) => fitRows(prev, argBounds(next)))
      draft.dropLabelDraft()
    }
  }

  function save() {
    if (collect) {
      onSave({ name, args: [draft.queryName] }, draft.constants)
      return
    }
    const constants: Record<string, unknown> = {}
    for (const entry of entries) {
      const key = entry.key.trim()
      if (key !== '') constants[key] = constantValue(entry.value)
    }
    onSave({ name, args: rows.map((r) => r.value) }, constants)
  }

  return (
    <div aria-label="Formula builder" role="form" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <label htmlFor="compute-operation" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>
          Operation
        </label>
        <select
          id="compute-operation"
          value={name}
          onChange={(e) => changeOperation(e.target.value)}
          style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}
        >
          {options.map((op) => (
            <option key={op.name} value={op.name}>{op.name}</option>
          ))}
        </select>
        {description && (
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.72rem', color: C_TEXT_SECONDARY }}>{description}</p>
        )}
      </div>

      {collect ? (
        <CollectEditor
          choice={draft.choice}
          customQuery={draft.customQuery}
          editor={draft.editor}
          labels={draft.labels}
          dimensionKey={draft.dimensionKey}
          valueKey={draft.valueKey}
          dimensionOptions={draft.dimensionOptions}
          valueOptions={draft.valueOptions}
          categoriesLoading={draft.categoriesLoading}
          categoriesError={draft.categoriesError}
          dimensionsTruncated={draft.dimensionsTruncated}
          valuesTruncated={draft.valuesTruncated}
          onChoiceChange={draft.changeChoice}
          onCustomQueryChange={draft.changeCustomQuery}
          onAddLabel={draft.addLabel}
          onRemoveLabel={draft.removeLabel}
          onLabelDraftChange={draft.setLabelDraft}
          onDimensionChange={draft.changeDimension}
          onValueChange={draft.changeValue}
        />
      ) : (
        <>
          <ArgSlots rows={rows} bounds={argBounds(name)} atoms={atoms} constantKeys={constantKeys} onChange={setRows} />
          <ConstantsEditor entries={entries} onChange={setEntries} />
        </>
      )}

      {blockReason && (
        <p role="status" style={{ margin: 0, fontSize: '0.75rem', color: C_ERROR }}>{blockReason}</p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={save}
          disabled={blockReason !== null || saving}
          style={{ padding: '0.25rem 0.75rem', cursor: 'pointer', fontWeight: 600 }}
        >
          Save formula
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '0.25rem 0.75rem', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
