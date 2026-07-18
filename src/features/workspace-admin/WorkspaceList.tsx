import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { Workspace } from '../../api-contract/workspace-operations'
import { C_BORDER_SUBTLE, C_SELECTION_BG, C_TEXT, C_TEXT_MUTED } from '../../styles/tokens'

interface WorkspaceListProps {
  workspaces: Workspace[]
  selectedUuid: string | null
  onSelect: (uuid: string) => void
  /** Resolves true on success — the inline form clears and collapses. */
  onCreate: (key: string, name: string, description: string) => Promise<boolean>
}

const itemButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '0.4rem 0.5rem',
  border: 'none',
  borderRadius: '4px',
  background: 'transparent',
  color: C_TEXT,
  fontFamily: 'inherit',
  fontSize: '0.85rem',
  cursor: 'pointer',
}

const fieldStyle: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', margin: '0.15rem 0 0.5rem' }

/**
 * Master list of the caller's workspaces plus the inline "New workspace" form
 * (ADR-260066 / REQ-FR-260074). Selection drives the detail pane.
 */
export function WorkspaceList({ workspaces, selectedUuid, onSelect, onCreate }: WorkspaceListProps) {
  const [creating, setCreating] = useState(false)
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!key.trim() || !name.trim()) return
    if (await onCreate(key.trim(), name.trim(), description.trim())) {
      setCreating(false)
      setKey('')
      setName('')
      setDescription('')
    }
  }

  return (
    <div style={{ minWidth: '14rem' }}>
      <ul aria-label="My workspaces" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {workspaces.map((workspace) => (
          <li key={workspace.uuid}>
            <button
              type="button"
              onClick={() => onSelect(workspace.uuid)}
              aria-pressed={workspace.uuid === selectedUuid}
              style={{
                ...itemButtonStyle,
                background: workspace.uuid === selectedUuid ? C_SELECTION_BG : 'transparent',
              }}
            >
              <span style={{ display: 'block' }}>{workspace.name}</span>
              <span style={{ display: 'block', fontSize: '0.75rem', color: C_TEXT_MUTED }}>
                {workspace.key} · {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {workspaces.length === 0 && (
        <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: C_TEXT_MUTED }}>No workspaces yet.</p>
      )}

      {!creating && (
        <button type="button" onClick={() => setCreating(true)} style={{ marginTop: '0.5rem', padding: '0.25rem 0.75rem' }}>
          New workspace
        </button>
      )}
      {creating && (
        <form onSubmit={handleCreate} style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: `1px solid ${C_BORDER_SUBTLE}`, fontSize: '0.85rem' }}>
          <label htmlFor="workspace-new-key">Key</label>
          <input id="workspace-new-key" value={key} onChange={(e) => setKey(e.target.value)} required style={fieldStyle} />
          <label htmlFor="workspace-new-name">Name</label>
          <input id="workspace-new-name" value={name} onChange={(e) => setName(e.target.value)} required style={fieldStyle} />
          <label htmlFor="workspace-new-description">Description</label>
          <input id="workspace-new-description" value={description} onChange={(e) => setDescription(e.target.value)} style={fieldStyle} />
          <button type="submit" style={{ padding: '0.25rem 0.75rem', marginRight: '0.5rem' }}>Create workspace</button>
          <button type="button" onClick={() => setCreating(false)} style={{ padding: '0.25rem 0.75rem' }}>Cancel</button>
        </form>
      )}
    </div>
  )
}
