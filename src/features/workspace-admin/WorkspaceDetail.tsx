import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Workspace } from '../../api-contract/workspace-operations'
import { useWorkspaceMembers } from './use-workspace-members'
import { MembersSection } from './MembersSection'
import { C_BORDER_SUBTLE, C_ERROR, C_TEXT_MUTED } from '../../styles/tokens'

interface WorkspaceDetailProps {
  workspace: Workspace
  /** The signed-in user's username; the caller's role derives from the member list (ADR-260066). */
  selfUsername?: string
  onUpdate: (uuid: string, name: string, description: string) => Promise<boolean>
  onDissolve: (uuid: string) => Promise<boolean>
  /** Member add/remove changed a memberCount — the workspace list should refresh. */
  onMembershipChanged: () => void
}

/**
 * Detail pane for one selected workspace (ADR-260066 / REQ-FR-260074): rename/description,
 * member management, and the two-step dissolve. Mount keyed by workspace uuid (the panel passes
 * `key`), so form state resets on selection change. Admin-only affordances are soft-gated on the
 * derived caller role; the backend enforces the gate regardless.
 */
export function WorkspaceDetail({ workspace, selfUsername, onUpdate, onDissolve, onMembershipChanged }: WorkspaceDetailProps) {
  const members = useWorkspaceMembers(workspace.uuid, onMembershipChanged)
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [confirmDissolve, setConfirmDissolve] = useState(false)

  const callerRole = selfUsername ? members.members.find((m) => m.username === selfUsername)?.role : undefined
  const isAdmin = callerRole === 'ADMIN'

  function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    void onUpdate(workspace.uuid, name.trim(), description.trim())
  }

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <form onSubmit={handleSave} style={{ fontSize: '0.85rem' }}>
        <p style={{ margin: '0 0 0.5rem', color: C_TEXT_MUTED }}>Key: {workspace.key}</p>
        <label htmlFor="workspace-detail-name">Name</label>
        <input
          id="workspace-detail-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', margin: '0.15rem 0 0.5rem' }}
        />
        <label htmlFor="workspace-detail-description">Description</label>
        <input
          id="workspace-detail-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', margin: '0.15rem 0 0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.25rem 0.75rem' }}>Save details</button>
      </form>

      <MembersSection state={members} isAdmin={isAdmin} />

      {isAdmin && (
        <section aria-label="Dissolve workspace" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: `1px solid ${C_BORDER_SUBTLE}` }}>
          {confirmDissolve ? (
            <>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: C_ERROR }}>
                Dissolving removes the workspace and all its memberships. This cannot be undone.
              </p>
              <button
                type="button"
                style={{ padding: '0.25rem 0.75rem', marginRight: '0.5rem', color: C_ERROR }}
                onClick={() => { void onDissolve(workspace.uuid) }}
              >
                Yes, dissolve workspace
              </button>
              <button type="button" onClick={() => setConfirmDissolve(false)} style={{ padding: '0.25rem 0.75rem' }}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDissolve(true)} style={{ padding: '0.25rem 0.75rem', color: C_ERROR }}>
              Dissolve workspace…
            </button>
          )}
        </section>
      )}
    </div>
  )
}
