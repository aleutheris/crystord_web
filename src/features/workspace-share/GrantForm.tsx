import { useState } from 'react'
import type { FormEvent } from 'react'

/**
 * Local structural unions (ADR-260069 §3): the form is presentational — callbacks in, no
 * api-contract coupling — so a future taxonomy-sharing epic can lift it unchanged. The
 * literals structurally match the schema's `PrincipalType` and grantable `AccessLevel`.
 */
type SharePrincipalType = 'USER' | 'WORKSPACE'
type ShareLevel = 'EDITOR' | 'VIEWER'

interface GrantFormProps {
  /** Disables submission while a mutation is in flight. */
  pending: boolean
  /** Grant `level` to the principal; resolves `true` on success (the form then resets). */
  onShare: (principal: string, principalType: SharePrincipalType, level: ShareLevel) => Promise<boolean>
}

/**
 * The grant form: one free-text principal — a username (USER) or workspace key (WORKSPACE),
 * resolved server-side — plus type and level selects. The input label follows the selected
 * type so the expected identifier is always stated.
 */
export function GrantForm({ pending, onShare }: GrantFormProps) {
  const [principal, setPrincipal] = useState('')
  const [principalType, setPrincipalType] = useState<SharePrincipalType>('USER')
  const [level, setLevel] = useState<ShareLevel>('VIEWER')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (await onShare(principal.trim(), principalType, level)) {
      setPrincipal('')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
      <input
        aria-label={principalType === 'USER' ? 'Username' : 'Workspace key'}
        placeholder={principalType === 'USER' ? 'username' : 'workspace key'}
        value={principal}
        onChange={(e) => setPrincipal(e.target.value)}
        required
        style={{ flex: '1 1 8rem', minWidth: '6rem' }}
      />
      <select aria-label="Principal type" value={principalType}
        onChange={(e) => setPrincipalType(e.target.value as SharePrincipalType)}>
        <option value="USER">User</option>
        <option value="WORKSPACE">Workspace</option>
      </select>
      <select aria-label="Access level" value={level}
        onChange={(e) => setLevel(e.target.value as ShareLevel)}>
        <option value="EDITOR">Editor</option>
        <option value="VIEWER">Viewer</option>
      </select>
      <button type="submit" disabled={pending || principal.trim() === ''} style={{ padding: '0.25rem 0.75rem' }}>
        Share
      </button>
    </form>
  )
}
