import { useState } from 'react'
import type { LabelChipEditorProps } from './widgets.types'

const SUGGESTIONS_LIST_ID = 'label-chip-suggestions'

/**
 * Style-neutral label chip editor (ADR-260061 / EPIC-260066 T8). Renders the selected labels as
 * removable chips plus an input that commits on Enter (with optional `<datalist>` autocomplete).
 * Data and styling are injected; EPIC-260067 (Classify) supplies suggestions and chip styling.
 */
export function LabelChipEditor({
  labels,
  suggestions = [],
  onAdd,
  onRemove,
  placeholder = 'Add label…',
  ariaLabel = 'Labels',
  classNames,
  chipStyle,
  onDraftChange,
}: LabelChipEditorProps) {
  const [draft, setDraft] = useState('')

  function updateDraft(value: string) {
    setDraft(value)
    onDraftChange?.(value)
  }

  function commit() {
    const value = draft.trim()
    if (value && !labels.includes(value)) onAdd(value)
    updateDraft('')
  }

  return (
    <div role="group" aria-label={ariaLabel} className={classNames?.root}>
      {labels.map((label) => (
        <span key={label} className={classNames?.chip} style={chipStyle?.(label)}>
          {label}
          <button
            type="button"
            aria-label={`Remove ${label}`}
            className={classNames?.remove}
            onClick={() => onRemove(label)}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="Add label"
        className={classNames?.input}
        list={suggestions.length > 0 ? SUGGESTIONS_LIST_ID : undefined}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => updateDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      {suggestions.length > 0 && (
        <datalist id={SUGGESTIONS_LIST_ID}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
    </div>
  )
}
