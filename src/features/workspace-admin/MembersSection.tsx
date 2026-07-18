import { useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import type { WorkspaceRole } from '../../api-contract/workspace-operations'
import type { WorkspaceMembersState } from './use-workspace-members'
import { C_BORDER_SUBTLE, C_TEXT_MUTED } from '../../styles/tokens'

const ROLES: WorkspaceRole[] = ['ADMIN', 'EDITOR', 'VIEWER']

const cellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '0.25rem 0.5rem 0.25rem 0',
  borderBottom: `1px solid ${C_BORDER_SUBTLE}`,
  fontSize: '0.8rem',
}

function RoleSelect({ label, value, disabled, onChange }: {
  label: string
  value: WorkspaceRole
  disabled?: boolean
  onChange: (role: WorkspaceRole) => void
}) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as WorkspaceRole)}>
      {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
    </select>
  )
}

/**
 * Members table + add-member row for the selected workspace (ADR-260066 / REQ-FR-260074).
 * Presentational — the hook state lives in WorkspaceDetail so the caller-role derivation and the
 * member list share one source. Admin-only affordances are soft-gated (`isAdmin`); the backend
 * enforces regardless.
 */
export function MembersSection({ state, isAdmin }: { state: WorkspaceMembersState; isAdmin: boolean }) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [newRole, setNewRole] = useState<WorkspaceRole>('VIEWER')

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!newUsername.trim()) return
    if (await state.addMember(newUsername.trim(), newRole)) {
      setNewUsername('')
      setNewRole('VIEWER')
    }
  }

  return (
    <section aria-label="Workspace members">
      <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: '0.9rem' }}>Members</h3>
      {state.loading && <p style={{ fontSize: '0.8rem', color: C_TEXT_MUTED }}>Loading members…</p>}
      {state.loadError && <p role="alert" style={{ fontSize: '0.8rem' }}>{state.loadError}</p>}
      {state.mutationError && <p role="alert" style={{ fontSize: '0.8rem' }}>{state.mutationError}</p>}

      {!state.loading && !state.loadError && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={cellStyle}>Username</th>
              <th style={cellStyle}>Email</th>
              <th style={cellStyle}>Role</th>
              {isAdmin && <th style={cellStyle}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {state.members.map((member) => (
              <tr key={member.userUuid}>
                <td style={cellStyle}>{member.username}</td>
                <td style={cellStyle}>{member.email}</td>
                <td style={cellStyle}>
                  {isAdmin
                    ? <RoleSelect label={`Role for ${member.username}`} value={member.role} disabled={state.pending}
                        onChange={(role) => void state.updateRole(member.username, role)} />
                    : member.role}
                </td>
                {isAdmin && (
                  <td style={cellStyle}>
                    {confirmRemove === member.username ? (
                      <>
                        <button type="button" disabled={state.pending} style={{ marginRight: '0.25rem' }}
                          onClick={() => { void state.removeMember(member.username).then(() => setConfirmRemove(null)) }}>
                          Confirm remove
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(null)}>Cancel</button>
                      </>
                    ) : (
                      <button type="button" aria-label={`Remove ${member.username}`} disabled={state.pending}
                        onClick={() => setConfirmRemove(member.username)}>
                        Remove
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isAdmin && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <input
            aria-label="Add member by username"
            placeholder="username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
          />
          <RoleSelect label="New member role" value={newRole} onChange={setNewRole} />
          <button type="submit" disabled={state.pending} style={{ padding: '0.25rem 0.75rem' }}>Add member</button>
        </form>
      )}
    </section>
  )
}
