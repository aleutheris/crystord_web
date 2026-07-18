import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { useModalFocus } from '../a11y/use-modal-focus'
import { useTheme } from '../styles/ThemeProvider'
import { C_BORDER, C_BORDER_SUBTLE, C_OVERLAY, C_SURFACE, C_TEXT, C_TEXT_MUTED } from '../styles/tokens'
import { useWorkspace } from './workspace-context'

const fieldsetStyle: CSSProperties = {
  border: `1px solid ${C_BORDER_SUBTLE}`,
  borderRadius: '6px',
  padding: '0.5rem 0.75rem',
  margin: '0 0 0.75rem',
}

const optionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.15rem 0',
  fontSize: '0.85rem',
  color: C_TEXT,
}

interface RadioOption<T extends string> {
  value: T
  label: string
}

function RadioGroup<T extends string>({ legend, name, options, value, onChange, hint }: {
  legend: string
  name: string
  options: RadioOption<T>[]
  value: T
  onChange: (value: T) => void
  hint?: string
}) {
  return (
    <fieldset style={fieldsetStyle}>
      <legend style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.25rem' }}>{legend}</legend>
      {options.map((option) => (
        <label key={option.value} style={optionStyle}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
      {hint && <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: C_TEXT_MUTED }}>{hint}</p>}
    </fieldset>
  )
}

/**
 * The Preferences modal (ADR-260066 / REQ-FR-260074): theme mode plus the EPIC-260066
 * preferences contract (`homeEmphasis`, `computeBadges` — semantics per ADR-260065). Shell-owned
 * because the preferences store is shell state — features must not import ui-shell. Rendered
 * inside the WorkspaceProvider, so the contract is read/written via the workspace context.
 */
export function PreferencesPanel({ onClose }: { onClose: () => void }) {
  const { mode, setMode } = useTheme()
  const { preferences } = useWorkspace()
  const dialogRef = useRef<HTMLDivElement>(null)
  useModalFocus(dialogRef, onClose)

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'fixed', inset: 0, background: C_OVERLAY, zIndex: 1000 }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        tabIndex={-1}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(26rem, 90vw)',
          background: C_SURFACE,
          border: `1px solid ${C_BORDER}`,
          borderRadius: '8px',
          padding: '1rem',
          zIndex: 1001,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 id="preferences-title" style={{ margin: 0, fontSize: '1.1rem' }}>Preferences</h2>
          <button type="button" aria-label="Close preferences" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>×</button>
        </div>

        <RadioGroup
          legend="Theme"
          name="preferences-theme"
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={mode}
          onChange={setMode}
        />

        <RadioGroup
          legend="Home emphasis"
          name="preferences-home-emphasis"
          options={[
            { value: 'compute', label: 'Compute (Flow first)' },
            { value: 'relationship', label: 'Relationships (Network first)' },
          ]}
          value={preferences.homeEmphasis}
          onChange={preferences.setHomeEmphasis}
          hint="Takes effect the next time the workspace loads."
        />

        <RadioGroup
          legend="Compute badges"
          name="preferences-compute-badges"
          options={[
            { value: 'always', label: 'Always' },
            { value: 'onDemand', label: 'Selected atom only' },
          ]}
          value={preferences.computeBadges}
          onChange={preferences.setComputeBadges}
        />
      </div>
    </>
  )
}
