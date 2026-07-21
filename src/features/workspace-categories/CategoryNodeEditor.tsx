import { useState, type FormEvent } from 'react'
import { C_BORDER, C_CARD_BG, C_ERROR, C_TEXT_SECONDARY } from '../../styles/tokens'
import { indentOption, type CategoryNodeMeta, type BrowseNodeRef, type DimensionOutlineEntry } from './category-tree'
import type { CategoryBrowse } from './use-category-browse'

interface CategoryNodeEditorProps {
  meta: CategoryNodeMeta
  browse: CategoryBrowse
  onClose: () => void
  /**
   * Dimensions offerable as this node's parent — the caller excludes the node itself and its own
   * descendants, so a cycle cannot be selected in the first place (the server would refuse it
   * regardless). Only meaningful for dimension nodes.
   */
  parentOptions?: DimensionOutlineEntry[]
}

const inputStyle = { width: '100%', fontSize: '0.8rem', marginBottom: '0.3rem' }
const buttonStyle = { padding: '0.15rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer' }
const legendStyle = { fontSize: '0.72rem', fontWeight: 700, color: C_TEXT_SECONDARY, padding: 0 }
const ROOT_VALUE = ''

/**
 * Inline editor for one tree node (ADR-260064, extended by ADR-260071 — no admin surface).
 *
 * Three (for a dimension, four) distinct actions live here, each in its own labelled fieldset:
 * rename, re-parent (dimensions only), add a child value, and a two-step delete. The legends are
 * load-bearing — the forms previously stacked unlabelled, two of them carrying a "Display name"
 * field, which read as though the add-child form created a dimension rather than a value.
 *
 * Backend `CAT-*` failures surface through the hook's `mutationError` (rendered by the navigator).
 *
 * **The rail is this editor's feedback surface.** Every action's result is visible there: rename
 * changes the label, set-parent moves the node, add-value adds a child, delete removes it. Two
 * actions also change local state — delete closes the editor (its subject is gone) and add-value
 * clears its inputs (so another can be added) — but those are functional, not confirmations. Read
 * as "two actions confirm and two don't", this invites a later pass to add success messages to
 * rename and set-parent; that would give them a second feedback channel for an outcome the rail
 * already shows. If editor-wide feedback is ever revisited, preserve the rule rather than the
 * apparent inconsistency.
 */
export function CategoryNodeEditor({ meta, browse, onClose, parentOptions = [] }: CategoryNodeEditorProps) {
  const [name, setName] = useState(meta.displayName)
  const [childKey, setChildKey] = useState('')
  const [childName, setChildName] = useState('')
  const [parentKey, setParentKey] = useState<string>(meta.parentDimensionKey ?? ROOT_VALUE)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const nodeRef: BrowseNodeRef = { kind: meta.kind, key: meta.key }
  const isDimension = meta.kind === 'dimension'
  const kindLabel = isDimension ? 'dimension' : 'value'
  /**
   * Re-parenting needs **OWNER** on the dimension being moved — the server checks a bare `OWNS`
   * edge, so an EDITOR grant is not enough (confirmed with the backend team). `canEditNode` admits
   * EDITOR, which is right for rename and add-value, so the move form carries its own stricter
   * gate. Without it an EDITOR-granted dimension would offer a move that always fails, and the
   * failure is unreadable: the server returns the same not-found error for "you don't own this"
   * as for "no such dimension", deliberately, so the response cannot be turned into a useful
   * message. `shareCategoryDimension` already grants EDITOR, so this is reachable today.
   */
  const canMove = isDimension && meta.accessLevel === 'OWNER'

  function handleRename(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    void browse.renameNode(nodeRef, trimmed, meta.parent)
  }

  function handleSetParent(event: FormEvent) {
    event.preventDefault()
    void browse.setDimensionParent(meta.key, meta.parentDimensionKey, parentKey === ROOT_VALUE ? null : parentKey)
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
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={legendStyle}>Rename this {kindLabel}</legend>
          <input aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          <button type="submit" style={buttonStyle}>Rename</button>
        </fieldset>
      </form>

      {isDimension && !canMove && (
        <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: C_TEXT_SECONDARY }}>
          Only this dimension&apos;s owner can move it.
        </p>
      )}

      {canMove && (
        <form onSubmit={handleSetParent} aria-label={`Set parent of ${meta.displayName}`} style={{ marginTop: '0.5rem' }}>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={legendStyle}>Move this dimension</legend>
            <select
              // Node-scoped, matching this editor's other labels ("Rename X", "Add value under X").
              // The add-dimension form can be open at the same time and also renders a parent
              // selector; an identical accessible name would make the two indistinguishable.
              aria-label={`Parent dimension for ${meta.displayName}`}
              value={parentKey}
              onChange={(e) => setParentKey(e.target.value)}
              style={inputStyle}
            >
              <option value={ROOT_VALUE}>No parent (top level)</option>
              {parentOptions.map((option) => (
                <option key={option.key} value={option.key}>{indentOption(option)}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle}>Set parent</button>
          </fieldset>
        </form>
      )}

      <form onSubmit={handleAddChild} aria-label={`Add value under ${meta.displayName}`} style={{ marginTop: '0.5rem' }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend style={legendStyle}>
            {isDimension ? `Add a value to ${meta.displayName}` : `Add a value under ${meta.displayName}`}
          </legend>
          <input aria-label="New value key" placeholder="key" value={childKey} onChange={(e) => setChildKey(e.target.value)} style={inputStyle} />
          <input aria-label="New value name" placeholder="Display name" value={childName} onChange={(e) => setChildName(e.target.value)} style={inputStyle} />
          <button type="submit" style={buttonStyle}>Add value</button>
        </fieldset>
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
