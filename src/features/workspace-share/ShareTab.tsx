import type { Atom } from '../../api-contract'
import { C_ERROR, C_SUCCESS, C_TEXT_MUTED } from '../../styles/tokens'
import { useAtomGrants } from './use-atom-grants'
import { useShareActions } from './use-share-actions'
import { GrantList } from './GrantList'
import { GrantForm } from './GrantForm'

/**
 * Local slice of the inspector-tab props (ADR-260069): features may not import ui-shell, so
 * the tab declares only what it consumes (the HistoryTab precedent).
 */
interface ShareTabProps {
  atom: Atom
}

/**
 * Share inspector tab (ADR-260069 / REQ-FR-260077): the selected atom's access grants with
 * grant/revoke flows. Registered owner-only (`when` gate) — every sharing operation is
 * owner-only server-side — so the caller's stated level is always OWNER. The list and form
 * are presentational (GrantList/GrantForm); this tab owns the atom/apollo wiring.
 */
export function ShareTab({ atom }: ShareTabProps) {
  const uuid = atom.properties.shellies.uuid
  const { grants, loading, error, refetch } = useAtomGrants(uuid)
  const { pending, feedback, share, revoke } = useShareActions(uuid, refetch)

  return (
    <section aria-label="Share" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <h3 style={{ margin: 0, fontSize: '0.85rem' }}>Share</h3>
      {/* Effective-level orientation (ADR-260069): only owners ever see this tab. */}
      <p style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>You own this atom.</p>

      {error && <div role="alert" style={{ fontSize: '0.8rem', color: C_ERROR }}>{error}</div>}

      {loading && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>Loading grants…</p>
      )}

      {!loading && !error && (
        <GrantList grants={grants} pending={pending} onRevoke={(principal, type) => void revoke(principal, type)} />
      )}

      <GrantForm pending={pending} onShare={share} />

      {feedback && (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          style={{ margin: 0, fontSize: '0.8rem', color: feedback.kind === 'error' ? C_ERROR : C_SUCCESS }}
        >
          {feedback.message}
        </p>
      )}
    </section>
  )
}
