import { useState } from 'react'
import type { Atom, OperationPayload } from '../../api-contract'
import { LabelChipEditor } from '../../ui-primitives'
import { C_TEXT_SECONDARY, C_ERROR } from '../../styles/tokens'
import { argBounds, isCollectOperation, COLLECT_QUERIES } from './operation-metadata'
import type { ArgBounds } from './operation-metadata'
import { ArgSlots } from './ArgSlots'
import type { ArgSlotRow } from './ArgSlots'
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

/** Sentinel for the free-text COLLECT query option (future backend registrations). */
const OTHER_QUERY = '__other__'

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
  const initialCollectArg = initial && isCollectOperation(initial.name) ? initial.args[0] ?? '' : ''

  const [name, setName] = useState(initialName)
  const [rows, setRows] = useState<ArgSlotRow[]>(() => fitRows(
    initial && !isCollectOperation(initial.name)
      ? initial.args.map((arg) => ({ source: arg in initialConstants ? 'constant' as const : 'atom' as const, value: arg }))
      : [],
    argBounds(initialName),
  ))
  const [collectChoice, setCollectChoice] = useState(
    initialCollectArg !== '' && !COLLECT_QUERIES.includes(initialCollectArg) ? OTHER_QUERY : (initialCollectArg || COLLECT_QUERIES[0]!),
  )
  const [customQuery, setCustomQuery] = useState(COLLECT_QUERIES.includes(initialCollectArg) ? '' : initialCollectArg)
  const [labels, setLabels] = useState<string[]>(() => {
    const raw = initialConstants['labels']
    return Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : []
  })
  const [entries, setEntries] = useState<ConstantEntry[]>(() =>
    Object.entries(initialConstants)
      .filter(([key]) => key !== 'labels')
      .map(([key, value]) => ({ key, value: String(value) })))

  const collect = isCollectOperation(name)
  // A previously saved unknown operation stays selectable even if discovery doesn't list it.
  const options = operations.some((op) => op.name === name)
    ? operations
    : [{ name, description: '' }, ...operations]
  const description = options.find((op) => op.name === name)?.description
  const constantKeys = [...new Set(entries.map((e) => e.key.trim()).filter((k) => k !== ''))]
  const queryName = collectChoice === OTHER_QUERY ? customQuery.trim() : collectChoice

  // Save gating with a reason (never a silently dead button). Arity minimums are enforced
  // structurally — rows are padded to min — so an unmet arity shows up as an empty slot.
  const blockReason = collect
    ? (queryName === '' ? 'Enter the collect query name.' : null)
    : rows.some((r) => r.value === '')
      ? 'Fill every argument slot.'
      : rows.some((r) => r.source === 'constant' && !constantKeys.includes(r.value))
        ? 'A constant argument references a key that no longer exists.'
        : null

  function changeOperation(next: string) {
    setName(next)
    if (!isCollectOperation(next)) setRows((prev) => fitRows(prev, argBounds(next)))
  }

  function save() {
    if (collect) {
      onSave({ name, args: [queryName] }, { labels })
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div>
            <label htmlFor="compute-collect-query" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>
              Collect query
            </label>
            <select
              id="compute-collect-query"
              value={collectChoice}
              onChange={(e) => setCollectChoice(e.target.value)}
              style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}
            >
              {COLLECT_QUERIES.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
              <option value={OTHER_QUERY}>other…</option>
            </select>
            {collectChoice === OTHER_QUERY && (
              <input
                aria-label="Custom collect query name"
                value={customQuery}
                placeholder="query name"
                onChange={(e) => setCustomQuery(e.target.value)}
                style={{ fontSize: '0.8rem', marginTop: '0.3rem', display: 'block' }}
              />
            )}
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
              Labels to collect
            </span>
            <LabelChipEditor
              labels={labels}
              ariaLabel="Collect labels"
              onAdd={(label) => setLabels((prev) => [...prev, label])}
              onRemove={(label) => setLabels((prev) => prev.filter((l) => l !== label))}
            />
          </div>
        </div>
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
