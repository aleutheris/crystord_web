import { useState } from 'react'
import type { CSSProperties } from 'react'
import { C_BORDER_SUBTLE, C_TEXT_MUTED } from '../../styles/tokens'

/**
 * Local structural slice of a grant (ADR-260069 §3): the list is presentational — grants and
 * callbacks in, no atom or api-contract coupling — so a future taxonomy-sharing epic can lift
 * it unchanged. `principalName` is the resolvable principal (username or workspace key).
 */
export interface GrantRow {
  principalUuid: string
  principalType: 'USER' | 'WORKSPACE'
  principalName: string
  level: string
  grantedAt: string
}

interface GrantListProps {
  grants: GrantRow[]
  /** Disables the revoke affordances while a mutation is in flight. */
  pending: boolean
  onRevoke: (principal: string, principalType: 'USER' | 'WORKSPACE') => void
}

const cellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '0.25rem 0.5rem 0.25rem 0',
  borderBottom: `1px solid ${C_BORDER_SUBTLE}`,
  fontSize: '0.8rem',
}

/**
 * The current grants on the shared item, each behind an inline two-step revoke confirm
 * (the MembersSection precedent — no dialog for a reversible-by-resharing action).
 */
export function GrantList({ grants, pending, onRevoke }: GrantListProps) {
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  if (grants.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.8rem', color: C_TEXT_MUTED }}>Not shared with anyone yet.</p>
  }

  return (
    <table aria-label="Access grants" style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={cellStyle}>Principal</th>
          <th style={cellStyle}>Type</th>
          <th style={cellStyle}>Level</th>
          <th style={cellStyle}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {grants.map((grant) => (
          <tr key={grant.principalUuid}>
            <td style={cellStyle}>
              {grant.principalName}
              <span style={{ display: 'block', fontSize: '0.7rem', color: C_TEXT_MUTED }}>
                {new Date(grant.grantedAt).toLocaleString()}
              </span>
            </td>
            <td style={cellStyle}>{grant.principalType}</td>
            <td style={cellStyle}>{grant.level}</td>
            <td style={cellStyle}>
              {confirmRevoke === grant.principalUuid ? (
                <span role="group" aria-label={`Confirm revoke for ${grant.principalName}`}>
                  <button type="button" disabled={pending} style={{ marginRight: '0.25rem' }}
                    onClick={() => { onRevoke(grant.principalName, grant.principalType); setConfirmRevoke(null) }}>
                    Confirm revoke
                  </button>
                  <button type="button" onClick={() => setConfirmRevoke(null)}>Cancel</button>
                </span>
              ) : (
                <button type="button" aria-label={`Revoke access for ${grant.principalName}`} disabled={pending}
                  onClick={() => setConfirmRevoke(grant.principalUuid)}>
                  Revoke
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
