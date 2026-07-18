import { useState } from 'react'
import type { Atom } from '../../api-contract'
import { C_BORDER, C_TEXT_SECONDARY } from '../../styles/tokens'
import type { ArgBounds } from './operation-metadata'
import { atomTitle, shortUuid } from './formula-format'

/** One argument slot: an atom reference (UUID) or a constant key (ADR-260065). */
export interface ArgSlotRow {
  source: 'atom' | 'constant'
  value: string
}

interface ArgSlotsProps {
  rows: ArgSlotRow[]
  bounds: ArgBounds
  atoms: Atom[]
  constantKeys: string[]
  onChange: (rows: ArgSlotRow[]) => void
}

/**
 * Argument slot rows within the operation's arity bounds — add/remove respects min/max;
 * atom references go through the title-searchable picker (never raw UUID entry).
 */
export function ArgSlots({ rows, bounds, atoms, constantKeys, onChange }: ArgSlotsProps) {
  const canAdd = bounds.max === undefined || rows.length < bounds.max
  const canRemove = rows.length > bounds.min

  function update(index: number, patch: Partial<ArgSlotRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <section aria-label="Arguments">
      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.8rem' }}>Arguments</h4>
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
          <select
            aria-label={`Argument ${i + 1} source`}
            value={row.source}
            onChange={(e) => update(i, { source: e.target.value as ArgSlotRow['source'], value: '' })}
            style={{ fontSize: '0.8rem' }}
          >
            <option value="atom">Atom reference</option>
            <option value="constant">Constant</option>
          </select>
          {row.source === 'atom' ? (
            <AtomPicker index={i} value={row.value} atoms={atoms} onPick={(uuid) => update(i, { value: uuid })} />
          ) : (
            <select
              aria-label={`Argument ${i + 1} constant`}
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
              style={{ fontSize: '0.8rem' }}
            >
              <option value="">Select constant…</option>
              {constantKeys.map((key) => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          )}
          {canRemove && (
            <button
              type="button"
              aria-label={`Remove argument ${i + 1}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              style={{ cursor: 'pointer' }}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          onClick={() => onChange([...rows, { source: 'atom', value: '' }])}
          style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
        >
          Add argument
        </button>
      )}
    </section>
  )
}

/** Title-searchable atom picker over the working set; a filled slot shows the resolved title. */
function AtomPicker({ index, value, atoms, onPick }: {
  index: number
  value: string
  atoms: Atom[]
  onPick: (uuid: string) => void
}) {
  const [query, setQuery] = useState('')

  if (value !== '') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}>
        {atomTitle(value, atoms) ?? shortUuid(value)}
        <button type="button" aria-label={`Clear argument ${index + 1}`} onClick={() => onPick('')} style={{ cursor: 'pointer' }}>
          ×
        </button>
      </span>
    )
  }

  const trimmed = query.trim().toLowerCase()
  const matches = trimmed === ''
    ? []
    : atoms
        .filter((a) => a.properties.nuclearies.title.toLowerCase().includes(trimmed))
        .slice(0, 8)

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: '0.2rem' }}>
      <input
        aria-label={`Find atom for argument ${index + 1}`}
        value={query}
        placeholder="Search atoms by title…"
        onChange={(e) => setQuery(e.target.value)}
        style={{ fontSize: '0.8rem', padding: '0.2rem 0.3rem' }}
      />
      {matches.length > 0 && (
        <ul
          role="listbox"
          aria-label={`Atom matches for argument ${index + 1}`}
          style={{ listStyle: 'none', margin: 0, padding: '0.15rem', border: `1px solid ${C_BORDER}`, borderRadius: 4 }}
        >
          {matches.map((a) => (
            <li key={a.properties.shellies.uuid}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => onPick(a.properties.shellies.uuid)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem', padding: '0.15rem 0.25rem', width: '100%', textAlign: 'left' }}
              >
                {a.properties.nuclearies.title}
              </button>
            </li>
          ))}
        </ul>
      )}
      {trimmed !== '' && matches.length === 0 && (
        <span style={{ fontSize: '0.72rem', color: C_TEXT_SECONDARY }}>No matching atoms.</span>
      )}
    </span>
  )
}
