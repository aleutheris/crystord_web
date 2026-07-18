import type { CSSProperties } from 'react'
import type { Atom } from '../../api-contract'
import {
  C_PRIMARY, C_CARD_BG, C_BORDER_SUBTLE, C_SELECTION_BG, C_TEXT_SECONDARY,
} from '../../styles/tokens'
import type { BoardColumnDef } from './board-model'

export interface BoardCardProps {
  atom: Atom
  selected: boolean
  /** Save in flight for this atom — rendered read-only meanwhile (full-document write guard). */
  busy: boolean
  canEdit: boolean
  /** All columns, Unassigned included — the accessible "Move to…" targets (ADR-260070). */
  moveTargets: BoardColumnDef[]
  onSelect: (uuid: string) => void
  onMove: (uuid: string, columnKey: string) => void
}

const titleStyle: CSSProperties = { fontWeight: 600, overflowWrap: 'anywhere' }
const labelsStyle: CSSProperties = { color: C_TEXT_SECONDARY, fontSize: '0.8125rem', overflowWrap: 'anywhere' }
const selectStyle: CSSProperties = { marginTop: '0.375rem', maxWidth: '100%', fontSize: '0.8125rem' }

/**
 * One atom card: title + labels line, click-to-select (shared selection), native HTML5 drag
 * source when movable, and the per-card "Move to…" select — the keyboard/screen-reader
 * path and the deterministic E2E path (ADR-260070; drag alone fails the accessibility floor).
 * VIEWER atoms render non-draggable with no move affordance.
 */
export function BoardCard({ atom, selected, busy, canEdit, moveTargets, onSelect, onMove }: BoardCardProps) {
  const uuid = atom.properties.shellies.uuid
  const { title } = atom.properties.nuclearies
  const movable = canEdit && !busy
  return (
    <article
      aria-label={title}
      aria-current={selected ? 'true' : undefined}
      aria-busy={busy || undefined}
      draggable={movable}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', uuid)}
      onClick={() => onSelect(uuid)}
      style={{
        padding: '0.5rem',
        borderRadius: 4,
        cursor: 'pointer',
        background: selected ? C_SELECTION_BG : C_CARD_BG,
        // Border weight doubles as a non-color-only selection cue alongside aria-current.
        border: selected ? `2px solid ${C_PRIMARY}` : `1px solid ${C_BORDER_SUBTLE}`,
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div style={titleStyle}>{title}</div>
      {atom.labels.length > 0 && <div style={labelsStyle}>{atom.labels.join(', ')}</div>}
      {movable && (
        // Move gestures are not selection gestures (same rule as the table's cell editors).
        <div onClick={(e) => e.stopPropagation()}>
          <select
            aria-label={`Move ${title} to`}
            value=""
            onChange={(e) => onMove(uuid, e.target.value)}
            style={selectStyle}
          >
            <option value="" disabled>Move to…</option>
            {moveTargets.map((t) => (
              <option key={t.key} value={t.key}>{t.displayName}</option>
            ))}
          </select>
        </div>
      )}
    </article>
  )
}
