import { useEffect, useState } from 'react'
import { useApolloClient } from '@apollo/client/react'
import { DISCOVER_OPERATIONS_QUERY } from '../../api-contract/compute-operations'
import type { DiscoverOperationsResponse, OperationFunction } from '../../api-contract/compute-operations'
import { FALLBACK_OPERATIONS } from './operation-metadata'

/**
 * Operation catalog for the formula builder (ADR-260065 / EPIC-260069). Loads
 * `discoverOperations` once (cache-first); a failed or empty discovery silently falls
 * back to the five built-ins so the builder keeps working offline from the registry.
 */
export function useOperations(): { operations: OperationFunction[]; loading: boolean } {
  const client = useApolloClient()
  const [operations, setOperations] = useState<OperationFunction[]>([...FALLBACK_OPERATIONS])
  // Starts true: the discovery below is in flight from mount (the useTaxonomy pattern —
  // keeps the effect body free of synchronous setState).
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void client
      .query<DiscoverOperationsResponse>({
        query: DISCOVER_OPERATIONS_QUERY,
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        const discovered = data?.discoverOperations ?? []
        if (discovered.length > 0) setOperations(discovered)
      })
      .catch(() => {
        // Silent fallback (ADR-260065): the built-in catalog is already in place.
      })
      .finally(() => setLoading(false))
  }, [client])

  return { operations, loading }
}
