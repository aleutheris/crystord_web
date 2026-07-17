import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Atom } from '../../api-contract/graph-queries'
import { atomPermissions } from '../../api-contract/access-control'
import { LabelChipEditor } from '../../ui-primitives'
import { C_BORDER, C_CARD_BG, C_ERROR, C_TEXT_MUTED } from '../../styles/tokens'

interface DetailPanelProps {
  atom?: Atom
  isCreationMode?: boolean
  onCreate?: (title: string, labels: string[], description: string, content: string) => Promise<void>
  onUpdate?: (uuid: string, atom: Atom) => Promise<void>
  onDelete?: (uuid: string) => void
  onClose: () => void
}

export function DetailPanel({ atom, isCreationMode, onCreate, onUpdate, onDelete, onClose }: DetailPanelProps) {
  const uuid = atom?.properties.shellies.uuid ?? ''
  const [title, setTitle] = useState(atom?.properties.nuclearies.title ?? '')
  const [description, setDescription] = useState(atom?.properties.nuclearies.description ?? '')
  const [content, setContent] = useState(atom?.properties.nuclearies.content ?? '')
  // Creation-mode only: `change` requires labels at creation, so creation keeps a chip editor.
  // Edit-mode label editing moved to the Classify inspector tab (ADR-260063 / EPIC-260067).
  const [labels, setLabels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Read-side affordance gating (BI-260061 / REQ-FR-260069). Creation is always editable (you own the
  // new atom); for an existing atom, gate on the caller's access level (missing → read-only).
  const perms = atomPermissions(atom?.accessLevel)
  const canEdit = Boolean(isCreationMode) || perms.canEdit
  const canDelete = !isCreationMode && perms.canDelete && Boolean(onDelete)
  const readOnly = !canEdit

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!canEdit) return
    setSaving(true)
    try {
      if (isCreationMode && onCreate) {
        await onCreate(title, labels, description, content)
      } else if (atom && onUpdate) {
        // Labels are untouched here (the spread keeps `atom.labels`) — Classify owns them.
        const updated: Atom = {
          ...atom,
          properties: {
            ...atom.properties,
            nuclearies: { ...atom.properties.nuclearies, title, description, content },
          },
        }
        await onUpdate(uuid, updated)
      }
    } finally {
      setSaving(false)
    }
  }

  const panelLabel = isCreationMode ? 'Create atom' : 'Atom details'

  return (
    <aside
      aria-label={panelLabel}
      style={{
        width: 320,
        height: isCreationMode ? '100%' : undefined,
        borderLeft: `1px solid ${C_BORDER}`,
        padding: '1rem',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        background: C_CARD_BG,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>
          {isCreationMode ? 'Create New Atom' : 'Atom Details'}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close panel" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem' }}>✕</button>
      </div>

      {readOnly && (
        <p role="status" style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: C_TEXT_MUTED }}>
          You have view-only access to this atom.
        </p>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
        <div>
          <label htmlFor="detail-title" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Title</label>
          <input id="detail-title" value={title} onChange={(e) => setTitle(e.target.value)} required readOnly={readOnly} style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }} />
        </div>
        {isCreationMode && (
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block' }}>Labels</span>
            <LabelChipEditor
              labels={labels}
              onAdd={(label) => setLabels((prev) => [...prev, label])}
              onRemove={(label) => setLabels((prev) => prev.filter((l) => l !== label))}
            />
          </div>
        )}
        <div>
          <label htmlFor="detail-description" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Description</label>
          <textarea id="detail-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} readOnly={readOnly} style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>
        <div>
          <label htmlFor="detail-content" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Content</label>
          <textarea id="detail-content" value={content} onChange={(e) => setContent(e.target.value)} rows={4} readOnly={readOnly} style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box', resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
          {canEdit && (
            <button type="submit" disabled={saving} style={{ padding: '0.4rem 1rem' }}>
              {saving ? (isCreationMode ? 'Creating…' : 'Saving…') : (isCreationMode ? 'Create' : 'Save')}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete!(uuid)}
              style={{ padding: '0.4rem 1rem', color: C_ERROR, marginLeft: 'auto' }}
            >
              Delete
            </button>
          )}
        </div>
      </form>

      {!isCreationMode && uuid && (
        <div style={{ fontSize: '0.7rem', color: C_TEXT_MUTED, marginTop: '0.75rem' }}>
          UUID: {uuid}
        </div>
      )}
    </aside>
  )
}
