import { useState, type FormEvent } from 'react'
import { C_BORDER, C_CARD_BG } from '../../styles/tokens'

interface AddDimensionFormProps {
  onSubmit: (key: string, displayName: string) => void
}

const inputStyle = { width: '100%', fontSize: '0.8rem', marginBottom: '0.3rem' }

/** Inline "add dimension" form for the rail header + affordance (ADR-260064). */
export function AddDimensionForm({ onSubmit }: AddDimensionFormProps) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const k = key.trim()
    const n = name.trim()
    if (!k || !n) return
    onSubmit(k, n)
  }

  return (
    <form
      aria-label="Add dimension"
      onSubmit={handleSubmit}
      style={{ border: `1px solid ${C_BORDER}`, borderRadius: 4, padding: '0.5rem', background: C_CARD_BG }}
    >
      <input aria-label="New dimension key" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} style={inputStyle} />
      <input aria-label="New dimension name" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <button type="submit" style={{ padding: '0.15rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer' }}>
        Create dimension
      </button>
    </form>
  )
}
