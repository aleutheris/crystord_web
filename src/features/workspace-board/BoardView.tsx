import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Atom } from '../../api-contract'
import { atomPermissions } from '../../api-contract'
import type { CategoryValue } from '../../api-contract/category-operations'
import { C_PRIMARY, C_CARD_BG, C_BORDER_SUBTLE, C_ERROR } from '../../styles/tokens'
import { deriveColumns, rootAncestorMap, columnAssignments, recategorized, isNoopMove, UNASSIGNED } from './board-model'
import { useBoardTaxonomy } from './use-board-taxonomy'
import { BoardColumn } from './BoardColumn'

/**
 * The slice of the shell-provided graph data the board consumes (ADR-260070 / EPIC-260075).
 * Declared structurally here because features may not import ui-shell or other features
 * (so neither `ViewProps` nor workspace-graph's `GraphData` is importable) — `GraphData`
 * satisfies this shape, which keeps the registry's `ComponentType<ViewProps>` typecheck sound.
 */
export interface BoardData {
  atoms: Atom[]
  loading: boolean
  error: string | null
  updateAtom: (uuid: string, atom: Atom) => Promise<void>
}

/** Mirrors the fixed ViewProps contract of the center view-host (ADR-260061). */
export interface BoardViewProps {
  data: BoardData
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  onCreateAtom: () => void
  /** Accepted for ViewProps parity; a no-op — a DOM board needs no reduced render mode. */
  renderMode?: 'full' | 'reduced'
}

const centerStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '1rem', textAlign: 'center' }

/**
 * Kanban center view for bulk classification (ADR-260070 / REQ-FR-260078): columns are the
 * chosen dimension's root values plus Unassigned, cards are atoms, and drag or the per-card
 * move menu recategorizes through the single `updateAtom` mutation source.
 */
export function BoardView({ data, selectedAtomId, onSelectAtom, onCreateAtom }: BoardViewProps) {
  const { atoms, loading, error, updateAtom } = data
  const taxonomy = useBoardTaxonomy()
  // Atoms whose save is in flight — rendered read-only meanwhile, because `updateAtom` is a
  // full-document write built from the last-fetched atom: a second move started before the
  // refetch lands would silently revert the first (replace-all semantics).
  const [pendingUuids, setPendingUuids] = useState<ReadonlySet<string>>(new Set())
  // Mutation failures the data layer doesn't surface (it only maps auth codes) — shown inline.
  const [saveError, setSaveError] = useState<string | null>(null)

  async function moveCard(dimensionKey: string, uuid: string, columnKey: string): Promise<void> {
    const atom = atoms.find((a) => a.properties.shellies.uuid === uuid)
    // The drop payload is arbitrary text — re-check existence, gating, and the in-flight guard.
    if (!atom || pendingUuids.has(uuid)) return
    if (!atomPermissions(atom.accessLevel).canEdit) return
    const rootKey = columnKey === UNASSIGNED ? null : columnKey
    if (isNoopMove(atom, dimensionKey, rootKey)) return
    setPendingUuids((prev) => new Set(prev).add(uuid))
    try {
      await updateAtom(uuid, recategorized(atom, dimensionKey, rootKey))
      setSaveError(null)
    } catch {
      // The strip above the board is the feedback surface; nothing else to do on failure.
      setSaveError('Could not save the change. Please try again.')
    } finally {
      setPendingUuids((prev) => {
        const next = new Set(prev)
        next.delete(uuid)
        return next
      })
    }
  }

  function columnsRow(dimensionKey: string, values: CategoryValue[]) {
    const columns = [{ key: UNASSIGNED, displayName: 'Unassigned' }, ...deriveColumns(values)]
    const assignments = columnAssignments(atoms, dimensionKey, rootAncestorMap(values))
    return (
      <div style={{ display: 'flex', gap: '0.75rem', padding: '0 0.5rem 0.5rem', overflowX: 'auto', flex: 1, alignItems: 'stretch' }}>
        {columns.map((column) => (
          <BoardColumn
            key={column.key}
            column={column}
            atoms={assignments.get(column.key) ?? []}
            moveTargets={columns}
            selectedAtomId={selectedAtomId}
            pendingUuids={pendingUuids}
            onSelect={onSelectAtom}
            onMove={(uuid, columnKey) => void moveCard(dimensionKey, uuid, columnKey)}
          />
        ))}
      </div>
    )
  }

  // Full-screen states only before any data exists; once cards are on screen, refetches and
  // errors must not unmount the board (scroll position and the chosen dimension live there).
  if (loading && atoms.length === 0) {
    return <div style={{ ...centerStyle, height: '100%' }}>Loading atoms…</div>
  }
  if (error && atoms.length === 0) {
    return <div role="alert" style={{ ...centerStyle, height: '100%', color: C_ERROR }}>{error}</div>
  }

  const notice = saveError ?? error ?? taxonomy.error

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', flexShrink: 0 }}>
        <select
          aria-label="Board dimension"
          value={taxonomy.chosenDimensionKey ?? ''}
          onChange={(e) => taxonomy.chooseDimension(e.target.value)}
        >
          <option value="">Choose dimension…</option>
          {taxonomy.dimensions.map((d) => (
            <option key={d.key} value={d.key}>{d.displayName}</option>
          ))}
        </select>
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

      {taxonomy.chosenDimensionKey === null ? (
        <div style={centerStyle}>Choose a dimension to lay out the board.</div>
      ) : taxonomy.values === null ? (
        <div style={centerStyle}>Loading dimension values…</div>
      ) : (
        columnsRow(taxonomy.chosenDimensionKey, taxonomy.values)
      )}
    </div>
  )
}
