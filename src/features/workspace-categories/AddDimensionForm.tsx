import { useState, type FormEvent } from 'react'
import { C_BORDER, C_CARD_BG } from '../../styles/tokens'
import { indentOption, type DimensionOutlineEntry } from './category-tree'

interface AddDimensionFormProps {
  onSubmit: (key: string, displayName: string, parentDimensionKey: string | null) => void
  /** Dimensions offered as a parent. Empty (the first-dimension case) hides the selector. */
  parentOptions?: DimensionOutlineEntry[]
}

const inputStyle = { width: '100%', fontSize: '0.8rem', marginBottom: '0.3rem' }

const ROOT_VALUE = ''

/**
 * Inline "add dimension" form for the rail header ＋ affordance (ADR-260064), extended by
 * ADR-260071 with an optional parent so a dimension can be created directly beneath another.
 * Creating with a parent is atomic (`createCategoryDimension(parentDimensionKeys…)`) — there is
 * no intermediate root state to clean up.
 */
export function AddDimensionForm({ onSubmit, parentOptions = [] }: AddDimensionFormProps) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [parentKey, setParentKey] = useState<string>(ROOT_VALUE)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const k = key.trim()
    const n = name.trim()
    if (!k || !n) return
    onSubmit(k, n, parentKey === ROOT_VALUE ? null : parentKey)
  }

  return (
    <form
      aria-label="Add dimension"
      onSubmit={handleSubmit}
      style={{ border: `1px solid ${C_BORDER}`, borderRadius: 4, padding: '0.5rem', background: C_CARD_BG }}
    >
      <input aria-label="New dimension key" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle} />
      <input aria-label="New dimension name" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      {parentOptions.length > 0 && (
        <select
          aria-label="Parent dimension"
          value={parentKey}
          onChange={(e) => setParentKey(e.target.value)}
          style={inputStyle}
        >
          <option value={ROOT_VALUE}>No parent (top level)</option>
          {parentOptions.map((option) => (
            <option key={option.key} value={option.key}>{indentOption(option)}</option>
          ))}
        </select>
      )}
      <button type="submit" style={{ padding: '0.15rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}>
        Create dimension
      </button>
    </form>
  )
}
