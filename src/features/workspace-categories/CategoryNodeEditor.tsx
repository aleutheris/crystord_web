import { useState, type FormEvent } from 'react'
import { C_BORDER, C_CARD_BG, C_ERROR, C_TEXT_SECONDARY } from '../../styles/tokens'
import type { CategoryNodeMeta, BrowseNodeRef } from './category-tree'
import type { CategoryBrowse } from './use-category-browse'

interface CategoryNodeEditorProps {
  meta: CategoryNodeMeta
  browse: CategoryBrowse
  onClose: () => void
}

const inputStyle = { width: '100%', fontSize: '0.8rem', marginBottom: '0.3rem' }
const buttonStyle = { padding: '0.15rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer' }

/**
 * Inline editor for one tree node (ADR-260064, Q2 — no admin surface): rename, add a child
 * value (parent = the node), and a two-step delete. Rendered only for nodes whose real
 * accessLevel allows editing; backend CAT-* failures surface verbatim via the hook's
 * mutationError (shown by the navigator, role="alert").
 */
export function CategoryNodeEditor({ meta, browse, onClose }: CategoryNodeEditorProps) {
  const [name, setName] = useState(meta.displayName)
  const [childKey, setChildKey] = useState('')
  const [childName, setChildName] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const nodeRef: BrowseNodeRef = { kind: meta.kind, key: meta.key }

  function handleRename(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    void browse.renameNode(nodeRef, trimmed, meta.parent)
  }

  function handleAddChild(event: FormEvent) {
    event.preventDefault()
    const key = childKey.trim()
    const displayName = childName.trim()
    if (!key || !displayName) return
    // For a dimension node the new value is a root (dimensionKey === meta.key); for a value
    // node it nests under it — the hook derives parentValueKeys from the node ref.
    void browse.createValue(key, displayName, meta.dimensionKey, nodeRef).then((ok) => {
      if (ok) {
        setChildKey('')
        setChildName('')
      }
    })
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true)
      return
    }
    void browse.removeNode(nodeRef, meta.parent).then((ok) => {
      if (ok) onClose()
    })
  }

  return (
    <section
      aria-label={`Edit ${meta.displayName}`}
      style={{ border: `1px solid ${C_BORDER}`, borderRadius: 4, padding: '0.5rem', background: C_CARD_BG, fontSize: '0.8rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <strong>{meta.displayName}</strong>
        <button type="button" aria-label="Close editor" onClick={onClose} style={{ ...buttonStyle, background: 'none', border: 'none', color: C_TEXT_SECONDARY }}>
          ×
        </button>
      </div>

      <form onSubmit={handleRename} aria-label={`Rename ${meta.displayName}`}>
        <input aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <button type="submit" style={buttonStyle}>Rename</button>
      </form>

      <form onSubmit={handleAddChild} aria-label={`Add value under ${meta.displayName}`} style={{ marginTop: '0.5rem' }}>
        <input aria-label="New value key" placeholder="key" value={childKey} onChange={(e) => setChildKey(e.target.value)} style={inputStyle} />
        <input aria-label="New value name" placeholder="Display name" value={childName} onChange={(e) => setChildName(e.target.value)} style={inputStyle} />
        <button type="submit" style={buttonStyle}>Add value</button>
      </form>

      <div style={{ marginTop: '0.5rem' }}>
        <button type="button" onClick={handleDelete} style={{ ...buttonStyle, color: C_ERROR }}>
          {confirmingDelete ? 'Confirm delete' : 'Delete'}
        </button>
        {confirmingDelete && (
          <button type="button" onClick={() => setConfirmingDelete(false)} style={{ ...buttonStyle, marginLeft: '0.3rem' }}>
            Cancel
          </button>
        )}
      </div>
    </section>
  )
}
