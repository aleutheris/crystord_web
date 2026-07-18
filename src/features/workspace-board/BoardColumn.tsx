import type { CSSProperties } from 'react'
import type { Atom } from '../../api-contract'
import { atomPermissions } from '../../api-contract'
import { C_SURFACE, C_BORDER_SUBTLE, C_TEXT_SECONDARY } from '../../styles/tokens'
import type { BoardColumnDef } from './board-model'
import { BoardCard } from './BoardCard'

export interface BoardColumnProps {
  column: BoardColumnDef
  atoms: Atom[]
  moveTargets: BoardColumnDef[]
  selectedAtomId: string | null
  pendingUuids: ReadonlySet<string>
  onSelect: (uuid: string) => void
  onMove: (uuid: string, columnKey: string) => void
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: '0.5rem',
  padding: '0.5rem',
  borderBottom: `1px solid ${C_BORDER_SUBTLE}`,
  fontWeight: 600,
}

const bodyStyle: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '0.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
}

/**
 * One value column (or Unassigned): header with display name + card count, and a droppable
 * body — native HTML5 drop target (ADR-260070; the per-card move menu is the accessible
 * equivalent). Dropping recategorizes to this column's root value via `onMove`.
 */
export function BoardColumn({ column, atoms, moveTargets, selectedAtomId, pendingUuids, onSelect, onMove }: BoardColumnProps) {
  return (
    <section
      aria-label={`${column.displayName} column`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const uuid = e.dataTransfer.getData('text/plain')
        if (uuid) onMove(uuid, column.key)
      }}
      style={{
        width: '15rem',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: C_SURFACE,
        border: `1px solid ${C_BORDER_SUBTLE}`,
        borderRadius: 6,
      }}
    >
      <header style={headerStyle}>
        <span>{column.displayName}</span>
        <span style={{ color: C_TEXT_SECONDARY, fontWeight: 400 }}>{atoms.length}</span>
      </header>
      <div style={bodyStyle}>
        {atoms.map((atom) => {
          const uuid = atom.properties.shellies.uuid
          return (
            <BoardCard
              key={uuid}
              atom={atom}
              selected={uuid === selectedAtomId}
              busy={pendingUuids.has(uuid)}
              canEdit={atomPermissions(atom.accessLevel).canEdit}
              moveTargets={moveTargets}
              onSelect={onSelect}
              onMove={onMove}
            />
          )
        })}
      </div>
    </section>
  )
}
