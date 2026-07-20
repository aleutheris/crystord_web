import { C_BORDER, C_CARD_BG, C_ERROR } from '../../styles/tokens'

interface CanvasActionNoticeProps {
  message: string
  onDismiss: () => void
}

/**
 * Failure notice for canvas mutations (bond create/remove, atom delete, undo).
 *
 * The canvas is the one view that had no feedback surface: its handlers swallowed errors on the
 * assumption that a refetch would correct the state, which left a failed action indistinguishable
 * from an inert control. Overlaid rather than inline so it cannot reflow the graph, and dismissible
 * because it describes a past action, not a persistent condition.
 */
export function CanvasActionNotice({ message, onDismiss }: CanvasActionNoticeProps) {
  return (
    <div
      role="alert"
      style={{
        position: 'absolute',
        top: '0.75rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: '90%',
        padding: '0.5rem 0.75rem',
        background: C_CARD_BG,
        border: `1px solid ${C_BORDER}`,
        borderLeft: `3px solid ${C_ERROR}`,
        borderRadius: 4,
        fontSize: '0.8rem',
        color: C_ERROR,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '0.9rem' }}
      >
        ✕
      </button>
    </div>
  )
}
