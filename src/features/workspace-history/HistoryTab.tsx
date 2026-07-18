import type { CSSProperties } from 'react'
import type { Atom, ChangeEvent, PropertyChange } from '../../api-contract'
import {
  C_BORDER,
  C_BORDER_SUBTLE,
  C_ERROR,
  C_SURFACE,
  C_TEXT_MUTED,
  C_TEXT_SECONDARY,
} from '../../styles/tokens'
import { useAtomChanges } from './use-atom-changes'

/**
 * Local slice of the inspector-tab props (ADR-260068): features may not import ui-shell, so
 * the tab declares only what it consumes (the ClassifyTab precedent). History is strictly
 * read-only — no update/delete callbacks.
 */
interface HistoryTabProps {
  atom: Atom
}

/** Event-type chip: outlined on the surface tone — informational, not a status color. */
const chipStyle: CSSProperties = {
  background: C_SURFACE,
  border: `1px solid ${C_BORDER}`,
  borderRadius: 999,
  padding: '0.05rem 0.5rem',
  fontSize: '0.72rem',
}

const VALUE_PREVIEW_LENGTH = 40
const ID_PREVIEW_LENGTH = 8

/** JSON scalar → display text: strings verbatim, everything else JSON-stringified. */
function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value
  return value === undefined ? '—' : JSON.stringify(value)
}

function truncate(text: string): string {
  return text.length > VALUE_PREVIEW_LENGTH ? `${text.slice(0, VALUE_PREVIEW_LENGTH - 1)}…` : text
}

/** Raw ids are unreadable — shorten for display; the full id rides in the tooltip. */
function shortId(id: string): string {
  return id.length > ID_PREVIEW_LENGTH ? `${id.slice(0, ID_PREVIEW_LENGTH)}…` : id
}

/** One `field: old → new` transition, truncated with the full value in the tooltip. */
function PropertyRow({ change }: { change: PropertyChange }) {
  const oldText = stringifyValue(change.oldValue)
  const newText = stringifyValue(change.newValue)
  return (
    <li style={{ fontSize: '0.78rem', overflowWrap: 'anywhere' }}>
      <span style={{ fontFamily: 'monospace' }}>{change.field}</span>
      {': '}
      <span title={oldText} style={{ color: C_TEXT_SECONDARY }}>{truncate(oldText)}</span>
      {' → '}
      <span title={newText}>{truncate(newText)}</span>
      {change.metrics && (
        <span style={{ display: 'block', fontSize: '0.72rem', color: C_TEXT_MUTED }}>
          removed {change.metrics.removedCount} · added {change.metrics.addedCount} ·{' '}
          {change.metrics.totalMembersAfter} total
        </span>
      )}
    </li>
  )
}

function EventRow({ event }: { event: ChangeEvent }) {
  return (
    <li
      style={{
        borderBottom: `1px solid ${C_BORDER_SUBTLE}`,
        padding: '0.5rem 0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.75rem' }}>{new Date(event.timestamp).toLocaleString()}</span>
        <span style={chipStyle}>{event.eventType}</span>
        {/* Honest identity (ADR-260068): the raw id shortened — no client-side name guessing. */}
        <span
          aria-label={`Author id ${event.userId}`}
          title={event.userId}
          style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: C_TEXT_MUTED }}
        >
          {shortId(event.userId)}
        </span>
      </div>
      {event.remark && (
        <p style={{ margin: 0, fontStyle: 'italic', fontSize: '0.78rem', color: C_TEXT_SECONDARY }}>
          {event.remark}
        </p>
      )}
      {event.propertyChanges.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {event.propertyChanges.map((change, i) => (
            <PropertyRow key={`${change.field}-${i}`} change={change} />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * History inspector tab (ADR-260068 / REQ-FR-260076): the selected atom's field-level change
 * audit, rendered in server order (newest-first) with page-size-probe pagination — "Show
 * more" hides once a short page proves the history exhausted.
 */
export function HistoryTab({ atom }: HistoryTabProps) {
  const { events, loading, error, endReached, loadMore, refresh } = useAtomChanges(
    atom.properties.shellies.uuid,
  )

  return (
    <section aria-label="History" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '0.85rem' }}>History</h3>
        <button
          type="button"
          aria-label="Refresh history"
          onClick={refresh}
          disabled={loading}
          style={{ padding: '0.2rem 0.6rem', cursor: 'pointer' }}
        >
          ⟳
        </button>
      </div>

      {error && <div role="alert" style={{ fontSize: '0.8rem', color: C_ERROR }}>{error}</div>}

      {events.length > 0 && (
        <ol aria-label="Change events" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {events.map((event, i) => (
            <EventRow key={`${event.timestamp}-${i}`} event={event} />
          ))}
        </ol>
      )}

      {loading && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>Loading history…</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>
          No recorded changes for this atom.
        </p>
      )}

      {!loading && !endReached && events.length > 0 && (
        <button
          type="button"
          onClick={loadMore}
          style={{ alignSelf: 'flex-start', padding: '0.25rem 0.75rem', cursor: 'pointer' }}
        >
          Show more
        </button>
      )}
    </section>
  )
}
