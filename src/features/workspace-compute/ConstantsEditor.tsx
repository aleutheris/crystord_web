import { C_TEXT_SECONDARY } from '../../styles/tokens'

/** One editable constant row; the value stays a string until save (`constantValue`). */
export interface ConstantEntry {
  key: string
  value: string
}

interface ConstantsEditorProps {
  entries: ConstantEntry[]
  onChange: (entries: ConstantEntry[]) => void
}

const inputStyle = { fontSize: '0.8rem', padding: '0.2rem 0.3rem', width: '7rem' }

/**
 * Key/value constants editor (ADR-260065): the keys it defines become pickable constant
 * references in the argument slots; numeric-looking values save as numbers.
 */
export function ConstantsEditor({ entries, onChange }: ConstantsEditorProps) {
  function update(index: number, patch: Partial<ConstantEntry>) {
    onChange(entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)))
  }

  return (
    <section aria-label="Constants">
      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.8rem' }}>Constants</h4>
      {entries.length === 0 && (
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', color: C_TEXT_SECONDARY }}>
          No constants defined.
        </p>
      )}
      {entries.map((entry, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '0.35rem' }}>
          <input
            aria-label={`Constant ${i + 1} key`}
            value={entry.key}
            placeholder="key"
            onChange={(e) => update(i, { key: e.target.value })}
            style={inputStyle}
          />
          <input
            aria-label={`Constant ${i + 1} value`}
            value={entry.value}
            placeholder="value"
            onChange={(e) => update(i, { value: e.target.value })}
            style={inputStyle}
          />
          <button
            type="button"
            aria-label={`Remove constant ${i + 1}`}
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
            style={{ cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...entries, { key: '', value: '' }])}
        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', cursor: 'pointer' }}
      >
        Add constant
      </button>
    </section>
  )
}
