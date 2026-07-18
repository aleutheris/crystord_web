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

export interface BoardTaxonomy {
  dimensions: CategoryDimension[]
  /** The board's dimension — view-local state, not persisted (ADR-260070 MVP). */
  chosenDimensionKey: string | null
  /** Choose the board dimension; `''` returns to the prompt state. */
  chooseDimension: (key: string) => void
  /** Full value list of the chosen dimension, or `null` while unchosen / still loading. */
  values: CategoryValue[] | null
  loading: boolean
  error: string | null
}

/**
 * Taxonomy state for the Board view (ADR-260070 / EPIC-260075): all dimensions load once on
 * mount; choosing a dimension loads its FULL value list (roots + rollup are derived
 * client-side) into a per-key cache, so switching back is instant. Modeled on
 * workspace-classify's useTaxonomy — cache-first reads, one shared pending counter.
 */
export function useBoardTaxonomy(): BoardTaxonomy {
  const client = useApolloClient()
  const [dimensions, setDimensions] = useState<CategoryDimension[]>([])
  const [chosenDimensionKey, setChosenDimensionKey] = useState<string | null>(null)
  const [valuesByDimension, setValuesByDimension] = useState<ReadonlyMap<string, CategoryValue[]>>(new Map())
  // Starts at 1: the dimensions load below is in flight from mount (counting it here keeps the
  // effect body free of synchronous setState, per react-hooks/set-state-in-effect).
  const [pending, setPending] = useState(1)
  const [error, setError] = useState<string | null>(null)
  // Dimensions whose values are loaded or in flight — dedupes repeat chooseDimension calls.
  const requestedRef = useRef(new Set<string>())

  const surfaceError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    const outcome = mapAuthError(msg)
    // Session expiry signs out globally — don't flash a raw error here (same rule as useGraphData).
    if (outcome.kind === 'reauth') return
    setError(outcome.code ? outcome.message : (msg || LOAD_ERROR))
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

  const chooseDimension = useCallback((key: string) => {
    if (!key) {
      setChosenDimensionKey(null)
      return
    }
    setChosenDimensionKey(key)
    if (requestedRef.current.has(key)) return
    requestedRef.current.add(key)
    setPending((n) => n + 1)
    void client
      .query<RetrieveCategoryValuesResponse>({
        query: RETRIEVE_CATEGORY_VALUES_QUERY,
        variables: { selector: { dimensionKey: key } },
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        const values = data?.retrieveCategoryValues ?? []
        setValuesByDimension((prev) => new Map(prev).set(key, values))
      })
      .catch((err: unknown) => {
        requestedRef.current.delete(key) // allow a retry by re-choosing
        surfaceError(err)
      })
      .finally(() => setPending((n) => n - 1))
  }, [client, surfaceError])

  const values = chosenDimensionKey === null ? null : valuesByDimension.get(chosenDimensionKey) ?? null

  return { dimensions, chosenDimensionKey, chooseDimension, values, loading: pending > 0, error }
}
