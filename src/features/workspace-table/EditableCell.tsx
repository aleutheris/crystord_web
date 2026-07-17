import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { C_TEXT } from '../../styles/tokens'

interface EditableCellProps {
  value: string
  /** Accessible field name, e.g. "title of Alpha" — the affordance reads "Edit title of Alpha". */
  fieldLabel: string
  /** Renders a textarea (content cells): Enter inserts a newline, Ctrl/Cmd+Enter commits. */
  multiline?: boolean
  /** Refuses to commit an empty value (title cells — parity with DetailPanel's required title). */
  required?: boolean
  onCommit: (next: string) => Promise<void>
}

const editorStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '0.25rem',
  font: 'inherit',
  color: C_TEXT,
}

/**
 * Inline-editable table cell body (EPIC-260071 T3 / ADR-260062 D3). Renders the value as an
 * edit button that swaps to an input/textarea. Enter commits (Ctrl/Cmd+Enter in multiline —
 * plain Enter must keep inserting newlines there) via the injected `onCommit` (the single
 * `updateAtom` mutation source); Escape or blur cancels. Key events stop at the cell so they
 * never leak to row-selection or canvas-level handlers.
 */
export function EditableCell({ value, fieldLabel, multiline = false, required = false, onCommit }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  function beginEdit(e: MouseEvent) {
    // Starting an edit is not a row-selection gesture — don't bubble to the row's onClick.
    e.stopPropagation()
    setDraft(value)
    setEditing(true)
  }

  async function commit() {
    setSaving(true)
    try {
      await onCommit(draft)
      setEditing(false)
    } catch {
      // Failure feedback is the table's save-error strip; stay in edit mode where possible.
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Enter') {
      // Multiline: plain Enter is a newline (native); only Ctrl/Cmd+Enter commits.
      if (multiline && !e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      if (required && draft.trim() === '') return
      void commit()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      setEditing(false)
    }
  }

  function handleBlur() {
    // Blur cancels — unless it was caused by the input disabling itself mid-save.
    if (!saving) setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Edit ${fieldLabel}`}
        onClick={beginEdit}
        style={{
          display: 'block',
          width: '100%',
          padding: '0.25rem',
          background: 'transparent',
          border: 'none',
          font: 'inherit',
          color: C_TEXT,
          textAlign: 'left',
          cursor: 'text',
        }}
      >
        {value}
      </button>
    )
  }

  const editorProps = {
    'aria-label': `Edit ${fieldLabel}`,
    value: draft,
    disabled: saving,
    autoFocus: true,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onKeyDown: handleKeyDown,
    onBlur: handleBlur,
  }

  return multiline
    ? <textarea {...editorProps} rows={2} title="Ctrl+Enter to save · Esc to cancel" style={{ ...editorStyle, resize: 'vertical' }} />
    : <input {...editorProps} title="Enter to save · Esc to cancel" style={editorStyle} />
}
