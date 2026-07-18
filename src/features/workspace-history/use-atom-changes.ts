import { useState, useEffect, useCallback, useRef } from 'react'
import { useApolloClient } from '@apollo/client/react'
import { ATOM_CHANGES_QUERY } from '../../api-contract/history-operations'
import type { AtomChangesResponse, ChangeEvent } from '../../api-contract/history-operations'
import { mapAuthError } from '../../api-contract/error-codes'

const LOAD_ERROR = 'Could not load the change history.'

/** One history page (ADR-260068): a page shorter than this means the history is exhausted. */
export const PAGE_SIZE = 10

export interface AtomChangesState {
  /** Loaded events, server order preserved (newest-first). */
  events: ChangeEvent[]
  loading: boolean
  error: string | null
  /** True once a page came back short — the schema has no total count (ADR-260068). */
  endReached: boolean
  /** Append the next page. */
  loadMore: () => void
  /** Re-fetch from offset 0 (the refresh affordance). */
  refresh: () => void
}

/**
 * Per-atom change-history pages for the History tab (ADR-260068 / EPIC-260073). Page 0 loads
 * on mount — the Inspector remounts tabs per atom, so each selection fetches fresh — and
 * every fetch is network-only: an audit trail must reflect the latest edits, never a cache.
 */
export function useAtomChanges(uuid: string): AtomChangesState {
  const client = useApolloClient()
  const [events, setEvents] = useState<ChangeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [endReached, setEndReached] = useState(false)
  // Monotonic request id: refresh (and unmount) bumps it, so a slow stale page can never land
  // after a reset — out-of-order protection for rapid refresh clicks.
  const requestIdRef = useRef(0)

  const fetchPage = useCallback((offset: number) => {
    const requestId = ++requestIdRef.current
    client
      .query<AtomChangesResponse>({
        query: ATOM_CHANGES_QUERY,
        variables: { uuid, limit: PAGE_SIZE, offset },
        fetchPolicy: 'network-only',
      })
      .then(({ data }) => {
        if (requestId !== requestIdRef.current) return
        // `retrieve` returns a list (unknown uuid → empty); null changes = none (ADR-260068).
        const page = data?.retrieve[0]?.properties.shellies.changes ?? []
        setEvents((prev) => (offset === 0 ? page : [...prev, ...page]))
        if (page.length < PAGE_SIZE) setEndReached(true)
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
  }, [client, uuid])

  /** Drop every in-flight page — nothing older than this call may touch state anymore. */
  const invalidateInFlight = useCallback(() => { requestIdRef.current++ }, [])

  useEffect(() => {
    // `loading` starts true, so the mount load needs no synchronous setState here
    // (per react-hooks/set-state-in-effect — the useTaxonomy pattern).
    fetchPage(0)
    return invalidateInFlight // no stale setState after unmount
  }, [fetchPage, invalidateInFlight])

  const loadMore = useCallback(() => {
    setLoading(true)
    fetchPage(events.length)
  }, [fetchPage, events.length])

  const refresh = useCallback(() => {
    setLoading(true)
    setEndReached(false)
    fetchPage(0)
  }, [fetchPage])

  return { events, loading, error, endReached, loadMore, refresh }
}
