import { useState, useCallback } from 'react'
import { useApolloClient } from '@apollo/client/react'
import {
  SHARE_ATOM_MUTATION,
  REVOKE_ATOM_ACCESS_MUTATION,
} from '../../api-contract/sharing-operations'
import type {
  GrantableAccessLevel,
  PrincipalType,
  RevokeAtomAccessResponse,
  ShareAtomResponse,
} from '../../api-contract/sharing-operations'
import { mapAuthError } from '../../api-contract/error-codes'

const SHARE_FAILED = 'Could not share the atom.'
const REVOKE_FAILED = 'Could not revoke that access.'

export interface ShareFeedback {
  kind: 'success' | 'error'
  message: string
}

export interface ShareActions {
  /** True while a share/revoke mutation is in flight (disables the affordances). */
  pending: boolean
  feedback: ShareFeedback | null
  /** Grant `level` access on the atom to a principal; resolves `true` on success. */
  share: (principal: string, principalType: PrincipalType, level: GrantableAccessLevel) => Promise<boolean>
  /** Revoke a principal's access on the atom; resolves `true` on success. */
  revoke: (principal: string, principalType: PrincipalType) => Promise<boolean>
}

/**
 * Grant/revoke actions for the Share tab (ADR-260069 / EPIC-260074), following the
 * AccountActions pending/feedback pattern. Every success re-fetches the grants list through
 * the threaded-in `refetchGrants` so the list is always the server's truth; principal typos
 * surface as the central mapper's unknown-principal message (the CR-16 code, ADR-260069),
 * unrecognized codes verbatim, and session expiry stays silent (global sign-out handles it).
 */
export function useShareActions(atomUuid: string, refetchGrants: () => Promise<void>): ShareActions {
  const client = useApolloClient()
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<ShareFeedback | null>(null)

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setFeedback(null)
    setPending(true)
    try {
      await action()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const outcome = mapAuthError(msg)
      if (outcome.kind !== 'reauth') setFeedback({ kind: 'error', message: outcome.code ? outcome.message : msg })
      return false
    } finally {
      setPending(false)
    }
  }, [])

  const share = useCallback(async (principal: string, principalType: PrincipalType, level: GrantableAccessLevel) => {
    const ok = await run(async () => {
      const { data } = await client.mutate<ShareAtomResponse>({
        mutation: SHARE_ATOM_MUTATION,
        variables: { atomUuid, principal, principalType, level },
      })
      if (!data?.shareAtom) throw new Error(SHARE_FAILED)
      await refetchGrants()
    })
    if (ok) setFeedback({ kind: 'success', message: `Shared with ${principal}.` })
    return ok
  }, [client, run, atomUuid, refetchGrants])

  const revoke = useCallback(async (principal: string, principalType: PrincipalType) => {
    const ok = await run(async () => {
      const { data } = await client.mutate<RevokeAtomAccessResponse>({
        mutation: REVOKE_ATOM_ACCESS_MUTATION,
        variables: { atomUuid, principal, principalType },
      })
      if (!data?.revokeAtomAccess) throw new Error(REVOKE_FAILED)
      await refetchGrants()
    })
    if (ok) setFeedback({ kind: 'success', message: `Revoked access for ${principal}.` })
    return ok
  }, [client, run, atomUuid, refetchGrants])

  return { pending, feedback, share, revoke }
}
