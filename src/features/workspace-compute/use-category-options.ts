import { useCallback, useEffect, useRef, useState } from 'react'
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
import { TAXONOMY_PAGE_LIMIT } from './category-option-list'

const LOAD_ERROR = 'Could not load categories.'

/**
 * Taxonomy reads paginate: "Pagination defaults to `limit=25`, `max limit=100`; over-limit →
 * `OR-QUERY-LIMIT-EXCEEDED`" (`user-guide.md:1096`). Un-paginated, a dimension with 26 values
 * returned 25 of them and the picker presented that page as the whole taxonomy — so a stored
 * `value_key` at position 26 was rendered "(not in your taxonomy)" about the user's own valid
 * data. Request the documented maximum, and treat a FULL page as possibly-truncated below.
 */
const PAGE_LIMIT = TAXONOMY_PAGE_LIMIT

/**
 * One dimension's values load: the rows, and the OUTCOME of the load that produced them.
 *
 * The outcome is stored per dimension rather than inferred from a shared error message, because a
 * message is not a proxy for a failure: it is absent for a session-expiry failure by design (see
 * `describeError`), and a single scalar is cleared by any later success while this entry is
 * per-dimension — so returning to a dimension whose load failed (`requestedRef` dedupes, so there
 * is no refetch) presented its empty placeholder as the complete taxonomy.
 */
interface ValuesEntry {
  values: CategoryValue[]
  /** Whether the load succeeded — `false` marks these rows as a placeholder, not as data. */
  ok: boolean
  /** What to report while this dimension is selected; null when the failure must stay silent. */
  message: string | null
}

/**
 * Both the success and the failure path must write an entry — a dimension with none reads as still
 * loading, so a failure that wrote nothing would hang `loading` forever.
 */
function cacheEntry(key: string, entry: ValuesEntry) {
  return (prev: ReadonlyMap<string, ValuesEntry>): ReadonlyMap<string, ValuesEntry> =>
    new Map(prev).set(key, entry)
}

export interface CategoryOptions {
  dimensions: CategoryDimension[]
  /** Values of the requested dimension; empty until they load (or if the load failed). */
  values: CategoryValue[]
  /**
   * Whether each list is known to be COMPLETE — loaded, that load SUCCEEDED, and it did not come
   * back full at the page ceiling. An empty list otherwise means "still loading" or "load failed",
   * which a caller must not read as "genuinely absent". Tracked per list because the two queries
   * fail independently, and keyed on each load's outcome rather than on whether a message is
   * currently on screen — see `dimensionsOk` and `ValuesEntry.ok`.
   */
  dimensionsAuthoritative: boolean
  valuesAuthoritative: boolean
  /**
   * Whether a list came back FULL at `TAXONOMY_PAGE_LIMIT` — so there MAY be more behind it that
   * the pickers, which do not page, cannot reach. Not a claim that anything was actually cut off:
   * the response carries no total and no has-more, so exactly-N and the-first-N-of-more are
   * indistinguishable, and callers must report the ambiguity rather than resolve it (see
   * `TruncationNote`). Distinct from `*Authoritative`, which a full page also forfeits: that flag
   * only suppresses a false "(not in your taxonomy)" claim, and suppressing a falsehood is not the
   * same as telling the user the list may be short.
   */
  dimensionsTruncated: boolean
  valuesTruncated: boolean
  loading: boolean
  error: string | null
}

/**
 * Dimension/value options for a category COLLECT (EPIC-260082): all dimensions load once on
 * mount, the selected dimension's values load lazily into a cache.
 *
 * Deliberately a second, slimmer implementation of what `workspace-classify`'s `useTaxonomy`
 * already does: `architecture.test.ts` forbids cross-feature imports, and promoting a shared
 * hook is out of this epic's scope (recorded as accepted debt in EPIC-260082, alongside
 * EPIC-260078's duplication theme). Differences from that hook are intentional — no
 * assigned-dimension preloading, and values-loading is *derived* rather than counted, which
 * keeps the effect bodies free of synchronous setState (react-hooks/set-state-in-effect).
 */
export function useCategoryOptions(dimensionKey: string, enabled = true): CategoryOptions {
  const client = useApolloClient()
  const [dimensions, setDimensions] = useState<CategoryDimension[]>([])
  const [valuesByDimension, setValuesByDimension] = useState<ReadonlyMap<string, ValuesEntry>>(new Map())
  // Loaded-ness is stored and loading DERIVED from it, so `enabled` can flip on (the user picks a
  // category query) without a synchronous setState in the effect body.
  const [dimensionsLoaded, setDimensionsLoaded] = useState(false)
  const dimensionsRequestedRef = useRef(false)
  // Success is its own flag, not `dimensionsError === null`: `describeError` returns null for a
  // session-expiry failure on purpose, so a reauth failure would otherwise read as a clean load of
  // an empty list — and `optionsWithSelected` would then annotate the user's own stored key
  // "(not in your taxonomy)" with no error on screen to contradict it.
  const [dimensionsOk, setDimensionsOk] = useState(false)
  // Tracked separately from the values failure: the two queries fail independently, so a values
  // load succeeding must not clear a dimensions failure that is still true (the picker would then
  // be silently empty).
  const [dimensionsError, setDimensionsError] = useState<string | null>(null)
  // Dimensions whose values are loaded or in flight — dedupes repeat requests.
  const requestedRef = useRef(new Set<string>())

  /** The message to show for a failure, or null when it must stay silent. */
  const describeError = useCallback((err: unknown): string | null => {
    const outcome = mapAuthError(err instanceof Error ? err.message : String(err))
    // Session expiry signs out globally — don't flash a raw error here (the useTaxonomy rule).
    if (outcome.kind === 'reauth') return null
    return outcome.code ? outcome.message : LOAD_ERROR
  }, [])

  useEffect(() => {
    if (!enabled || dimensionsRequestedRef.current) return
    dimensionsRequestedRef.current = true
    void client
      .query<RetrieveCategoryDimensionsResponse>({
        query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
        variables: { selector: { limit: PAGE_LIMIT } },
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        const rows = data?.retrieveCategoryDimensions
        // `ok` means the list ARRIVED, not that the promise settled: a fulfilled response with no
        // payload field is the reauth false-authority bug through a different door.
        if (rows === undefined || rows === null) {
          setDimensionsError(LOAD_ERROR)
          return
        }
        setDimensions(rows)
        setDimensionsOk(true)
      })
      .catch((err: unknown) => setDimensionsError(describeError(err)))
      .finally(() => setDimensionsLoaded(true))
  }, [client, enabled, describeError])

  useEffect(() => {
    if (!enabled || dimensionKey === '' || requestedRef.current.has(dimensionKey)) return
    requestedRef.current.add(dimensionKey)
    void client
      .query<RetrieveCategoryValuesResponse>({
        query: RETRIEVE_CATEGORY_VALUES_QUERY,
        variables: { selector: { dimensionKey, limit: PAGE_LIMIT } },
        fetchPolicy: 'cache-first',
      })
      .then(({ data }) => {
        // Same rule as the dimensions load: a fulfilled response with no payload field did not
        // deliver a list, so it must not be cached as an authoritative empty taxonomy.
        const rows = data?.retrieveCategoryValues
        setValuesByDimension(rows === undefined || rows === null
          ? cacheEntry(dimensionKey, { values: [], ok: false, message: LOAD_ERROR })
          : cacheEntry(dimensionKey, { values: rows, ok: true, message: null }))
      })
      .catch((err: unknown) => {
        // Cache a FAILED entry so the derived `loading` below resolves rather than hanging forever
        // on a dimension whose values will never arrive, and so coming back to this dimension
        // re-reports the failure instead of claiming the empty placeholder is the whole taxonomy.
        setValuesByDimension(cacheEntry(dimensionKey, { values: [], ok: false, message: describeError(err) }))
      })
  }, [client, enabled, dimensionKey, describeError])

  // Derived, not stored: a selected dimension whose values are not in the cache yet is loading.
  const entry = valuesByDimension.get(dimensionKey)
  const dimensionsLoading = enabled && !dimensionsLoaded
  const valuesLoading = enabled && dimensionKey !== '' && entry === undefined
  const values = entry?.values ?? []
  // The values failure belongs to the dimension it happened on: switching away hides it, switching
  // back shows it again. The trade is that a failure landing after the user moved on goes unseen
  // while they stay away (and `requestedRef` means no retry) — accepted, because the alternative is
  // one scalar lingering across a selection change, which is the round-2 defect: a "Could not load
  // categories." notice sitting above a picker that works.
  const valuesError = entry?.message ?? null
  // A page that came back full may have more behind it, and nothing in the response says which.
  // Claiming authority over a possibly-truncated list is what produced the false "(not in your
  // taxonomy)" label, so a full page forfeits it.
  const dimensionsComplete = dimensions.length < PAGE_LIMIT
  const valuesComplete = values.length < PAGE_LIMIT

  return {
    dimensions,
    values,
    dimensionsAuthoritative: dimensionsLoaded && dimensionsOk && dimensionsComplete,
    // An entry exists only for a dimension that was actually requested, so its presence already
    // implies one is selected.
    valuesAuthoritative: entry?.ok === true && valuesComplete,
    // Only a list that actually ARRIVED can be truncated — an empty list mid-flight is not.
    dimensionsTruncated: dimensionsLoaded && !dimensionsComplete,
    valuesTruncated: entry !== undefined && !valuesComplete,
    loading: dimensionsLoading || valuesLoading,
    // A missing dimension list is the more fundamental failure, so it is reported first.
    error: dimensionsError ?? valuesError,
  }
}
