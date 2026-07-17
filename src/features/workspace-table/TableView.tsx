import { useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { Atom } from '../../api-contract'
import { atomPermissions } from '../../api-contract'
import { LabelChipEditor } from '../../ui-primitives'
import {
  C_PRIMARY, C_CARD_BG, C_BORDER_SUBTLE, C_SELECTION_BG, C_SURFACE,
  C_TEXT_SECONDARY, C_ERROR,
} from '../../styles/tokens'
import { EditableCell } from './EditableCell'
import { sortAtoms } from './sort'

/**
 * The slice of the shell-provided graph data the table consumes (ADR-260062 / EPIC-260071).
 * Declared structurally here because features may not import ui-shell or other features
 * (so neither `ViewProps` nor workspace-graph's `GraphData` is importable) — `GraphData`
 * satisfies this shape, which keeps the registry's `ComponentType<ViewProps>` typecheck sound.
 */
export interface TableData {
  atoms: Atom[]
  loading: boolean
  error: string | null
  updateAtom: (uuid: string, atom: Atom) => Promise<void>
}

/** Mirrors the fixed ViewProps contract of the center view-host (ADR-260061). */
export interface TableViewProps {
  data: TableData
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  onCreateAtom: () => void
  /** Accepted for ViewProps parity; a no-op — a DOM table needs no reduced render mode. */
  renderMode?: 'full' | 'reduced'
}

/** Deep-spread one nucleary text field, preserving operation/constants/bonds/labels. */
function withNuclearyField(atom: Atom, field: 'title' | 'content', value: string): Atom {
  return {
    ...atom,
    properties: {
      ...atom.properties,
      nuclearies: { ...atom.properties.nuclearies, [field]: value },
    },
  }
}

function withLabels(atom: Atom, labels: string[]): Atom {
  return { ...atom, labels }
}

const centerStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '1rem', textAlign: 'center' }
const thStyle: CSSProperties = { textAlign: 'left', padding: '0.5rem', borderBottom: `2px solid ${C_BORDER_SUBTLE}`, background: C_SURFACE, position: 'sticky', top: 0 }
const tdStyle: CSSProperties = { padding: '0.25rem 0.5rem', borderBottom: `1px solid ${C_BORDER_SUBTLE}`, verticalAlign: 'top' }

/**
 * Spreadsheet-style center view (EPIC-260071 / ADR-260062 / REQ-FR-260070): one row per atom,
 * shared selection via onSelectAtom/selectedAtomId, inline edits through the single
 * `updateAtom` mutation source so every view reflects them.
 */
export function TableView({ data, selectedAtomId, onSelectAtom, onCreateAtom }: TableViewProps) {
  const { atoms, loading, error, updateAtom } = data
  // Rows whose save is in flight — rendered read-only meanwhile, because `updateAtom` is a
  // full-document write built from the last-fetched atom: a second edit started before the
  // refetch lands would silently revert the first (replace-all semantics).
  const [pendingUuids, setPendingUuids] = useState<ReadonlySet<string>>(new Set())
  // Mutation failures the data layer doesn't surface (it only maps auth codes) — shown inline.
  const [saveError, setSaveError] = useState<string | null>(null)

  async function saveAtom(uuid: string, atom: Atom): Promise<void> {
    setPendingUuids((prev) => new Set(prev).add(uuid))
    try {
      await updateAtom(uuid, atom)
      setSaveError(null)
    } catch (err) {
      setSaveError('Could not save the change. Please try again.')
      throw err
    } finally {
      setPendingUuids((prev) => {
        const next = new Set(prev)
        next.delete(uuid)
        return next
      })
    }
  }

  const saveQuietly = (uuid: string, atom: Atom): void => {
    // The strip above the table is the feedback surface; nothing else to do on failure.
    void saveAtom(uuid, atom).catch(() => undefined)
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, uuid: string) {
    // Row-level keys apply only when the row itself is focused — keys bubbling out of a cell
    // editor must keep their editing meaning (e.g. arrows move the caret, not the row focus).
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter') {
      onSelectAtom(uuid)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      ;(e.currentTarget.nextElementSibling as HTMLElement | null)?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      ;(e.currentTarget.previousElementSibling as HTMLElement | null)?.focus()
    }
  }

  // Full-screen states only before any data exists; once rows are on screen, refetches and
  // errors must not unmount the table (scroll position, focus, and cell drafts live there).
  if (loading && atoms.length === 0) {
    return <div style={{ ...centerStyle, height: '100%' }}>Loading atoms…</div>
  }
  if (error && atoms.length === 0) {
    return <div role="alert" style={{ ...centerStyle, height: '100%', color: C_ERROR }}>{error}</div>
  }

  const notice = saveError ?? error

  return (
    <div style={{ height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.5rem', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onCreateAtom}
          aria-label="Create atom"
          style={{ padding: '0.25rem 0.75rem', cursor: 'pointer', background: C_PRIMARY, color: C_CARD_BG, border: 'none', borderRadius: 4, fontWeight: 600 }}
        >
          Create Atom
        </button>
      </div>

      {notice && (
        <div role="alert" style={{ padding: '0.375rem 0.75rem', color: C_ERROR, borderBottom: `1px solid ${C_BORDER_SUBTLE}` }}>
          {notice}
        </div>
      )}

      {atoms.length === 0 ? (
        <div style={centerStyle}>No atoms in the current results. Run a search to populate the table.</div>
      ) : (
        <table aria-label="Atoms table" style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Title', 'Labels', 'Content', 'Computed'].map((h) => (
                <th key={h} scope="col" style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortAtoms(atoms, 'title').map((atom) => {
              const uuid = atom.properties.shellies.uuid
              const { title, content, operation } = atom.properties.nuclearies
              const rowBusy = pendingUuids.has(uuid)
              const canEdit = atomPermissions(atom.accessLevel).canEdit && !rowBusy
              // ADR-260062 keys "computed" off `operation != null`, but the create path writes
              // '' for non-computed atoms — so only a NON-EMPTY operation means computed.
              const isComputed = Boolean(operation)
              const selected = uuid === selectedAtomId
              return (
                <tr
                  key={uuid}
                  tabIndex={0}
                  aria-current={selected ? 'true' : undefined}
                  aria-busy={rowBusy || undefined}
                  onClick={() => onSelectAtom(uuid)}
                  onKeyDown={(e) => handleRowKeyDown(e, uuid)}
                  style={{ cursor: 'pointer', background: selected ? C_SELECTION_BG : undefined, opacity: rowBusy ? 0.6 : 1 }}
                >
                  <td style={tdStyle}>
                    {canEdit
                      ? <EditableCell value={title} fieldLabel={`title of ${title}`} required onCommit={(next) => saveAtom(uuid, withNuclearyField(atom, 'title', next))} />
                      : title}
                  </td>
                  <td style={tdStyle}>
                    {canEdit ? (
                      // Label gestures are not row-selection gestures (same rule as EditableCell).
                      <div onClick={(e) => e.stopPropagation()}>
                        <LabelChipEditor
                          labels={atom.labels}
                          ariaLabel={`Labels of ${title}`}
                          onAdd={(label) => saveQuietly(uuid, withLabels(atom, [...atom.labels, label]))}
                          onRemove={(label) => saveQuietly(uuid, withLabels(atom, atom.labels.filter((l) => l !== label)))}
                        />
                      </div>
                    ) : (
                      <span style={{ color: C_TEXT_SECONDARY }}>{atom.labels.join(', ')}</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {isComputed ? (
                      // Compute owns computed content (ADR-260062 D3) — read-only, ƒ-styled.
                      <span style={{ fontStyle: 'italic', color: C_TEXT_SECONDARY }}>{content}</span>
                    ) : canEdit ? (
                      <EditableCell value={content} fieldLabel={`content of ${title}`} multiline onCommit={(next) => saveAtom(uuid, withNuclearyField(atom, 'content', next))} />
                    ) : (
                      content
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {isComputed && (
                      <span role="img" aria-label="Computed atom" title="Computed atom" style={{ color: C_PRIMARY, fontWeight: 600 }}>
                        ƒ
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
