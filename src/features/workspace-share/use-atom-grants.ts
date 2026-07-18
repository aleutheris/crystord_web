import { useState, useEffect, useCallback, useRef } from 'react'
import { useApolloClient } from '@apollo/client/react'
import { LIST_ATOM_GRANTS_QUERY } from '../../api-contract/sharing-operations'
import type { AtomGrant, ListAtomGrantsResponse } from '../../api-contract/sharing-operations'
import { mapAuthError } from '../../api-contract/error-codes'

const LOAD_ERROR = 'Could not load the grant list.'

export interface AtomGrantsState {
  /** Loaded grants, server order preserved. */
  grants: AtomGrant[]
  loading: boolean
  error: string | null
  /** Re-fetch the list (share/revoke call this after a successful mutation). */
  refetch: () => Promise<void>
}

/**
 * The selected atom's access grants for the Share tab (ADR-260069 / EPIC-260074). Loads on
 * mount — the Inspector remounts tabs per atom, so each selection fetches fresh — and every
 * fetch is network-only: a sharing surface must reflect current access, never a cache.
 */
export function useAtomGrants(atomUuid: string): AtomGrantsState {
  const client = useApolloClient()
  const [grants, setGrants] = useState<AtomGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Monotonic request id (the useAtomChanges guard): unmount bumps it, and only the newest
  // request may touch state — a slow stale list can never land over a fresher one.
  const requestIdRef = useRef(0)

  const refetch = useCallback((): Promise<void> => {
    const requestId = ++requestIdRef.current
    return client
      .query<ListAtomGrantsResponse>({
        query: LIST_ATOM_GRANTS_QUERY,
        variables: { atomUuid },
        fetchPolicy: 'network-only',
      })
      .then(({ data }) => {
        if (requestId !== requestIdRef.current) return
        setGrants(data?.listAtomGrants ?? [])
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (requestId !== requestIdRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        const outcome = mapAuthError(msg)
        // Session expiry signs out globally (useGraphData's rule); unrecognized codes surface
        // the raw message verbatim (the use-category-browse precedent).
        if (outcome.kind !== 'reauth') setError(outcome.code ? outcome.message : msg || LOAD_ERROR)
        setLoading(false)
      })
  }, [client, atomUuid])

  /** Drop every in-flight fetch — nothing older than this call may touch state anymore. */
  const invalidateInFlight = useCallback(() => { requestIdRef.current++ }, [])

  useEffect(() => {
    // `loading` starts true, so the mount load needs no synchronous setState here
    // (per react-hooks/set-state-in-effect — the useAtomChanges pattern).
    void refetch()
    return invalidateInFlight // no stale setState after unmount
  }, [refetch, invalidateInFlight])

  return { grants, loading, error, refetch }
}
