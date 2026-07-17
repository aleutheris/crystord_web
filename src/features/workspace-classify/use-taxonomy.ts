import { useState, useEffect, useCallback, useRef } from 'react'
import { useApolloClient } from '@apollo/client/react'
import {
  RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
  RETRIEVE_CATEGORY_VALUES_QUERY,
} from '../../api-contract/category-operations'
import type {
  CategoryDimension,
  CategoryValue,
  RetrieveCategoryDimensionsResponse,
  RetrieveCategoryValuesResponse,
} from '../../api-contract/category-operations'
import { mapAuthError } from '../../api-contract/error-codes'

const LOAD_ERROR = 'Could not load categories.'

export interface Taxonomy {
  dimensions: CategoryDimension[]
  valuesByDimension: ReadonlyMap<string, CategoryValue[]>
  loading: boolean
  error: string | null
  loadValues: (dimensionKey: string) => void
}

/**
 * Taxonomy metadata for the Classify tab (ADR-260063 / EPIC-260067): all dimensions load once
 * on mount; values load lazily per dimension into a cache. Values for the dimensions already
 * assigned on the atom auto-load so chip display names and ancestor paths resolve.
 */
export function useTaxonomy(assignedDimensionKeys: readonly string[]): Taxonomy {
  const client = useApolloClient()
  const [dimensions, setDimensions] = useState<CategoryDimension[]>([])
  const [valuesByDimension, setValuesByDimension] = useState<ReadonlyMap<string, CategoryValue[]>>(new Map())
  // Starts at 1: the dimensions load below is in flight from mount (counting it here keeps the
  // effect body free of synchronous setState, per react-hooks/set-state-in-effect).
  const [pending, setPending] = useState(1)
  const [error, setError] = useState<string | null>(null)
  // Dimensions whose values are loaded or in flight — dedupes repeat loadValues calls.
  const requestedRef = useRef(new Set<string>())

  const surfaceError = useCallback((err: unknown) => {
    const outcome = mapAuthError(err instanceof Error ? err.message : String(err))
    // Session expiry signs out globally — don't flash a raw error here (same rule as useGraphData).
    if (outcome.kind === 'reauth') return
    setError(outcome.code ? outcome.message : LOAD_ERROR)
  }, [])

  useEffect(() => {
    void client
      .query<RetrieveCategoryDimensionsResponse>({
        query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        setDimensions(data?.retrieveCategoryDimensions ?? [])
      })
      .catch(surfaceError)
      .finally(() => setPending((n) => n - 1))
  }, [client, surfaceError])

  const loadValues = useCallback((dimensionKey: string) => {
    if (requestedRef.current.has(dimensionKey)) return
    requestedRef.current.add(dimensionKey)
    setPending((n) => n + 1)
    void client
      .query<RetrieveCategoryValuesResponse>({
        query: RETRIEVE_CATEGORY_VALUES_QUERY,
        variables: { selector: { dimensionKey } },
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        const values = data?.retrieveCategoryValues ?? []
        setValuesByDimension((prev) => new Map(prev).set(dimensionKey, values))
      })
      .catch((err: unknown) => {
        requestedRef.current.delete(dimensionKey) // allow a retry after a failure
        surfaceError(err)
      })
      .finally(() => setPending((n) => n - 1))
  }, [client, surfaceError])

  useEffect(() => {
    for (const key of assignedDimensionKeys) loadValues(key)
  }, [assignedDimensionKeys, loadValues])

  return { dimensions, valuesByDimension, loading: pending > 0, error, loadValues }
}
