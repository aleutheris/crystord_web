import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCategoryOptions } from './use-category-options'
import {
  RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
  RETRIEVE_CATEGORY_VALUES_QUERY,
} from '../../api-contract/category-operations'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const REGION = {
  key: 'region',
  displayName: 'Region',
  description: null,
  parentDimensionKeys: [],
  accessLevel: 'OWNER' as const,
  ownerUsername: 'me',
}

const EUROPE = {
  key: 'europe',
  displayName: 'Europe',
  description: null,
  dimensionKey: 'region',
  parentValueKeys: [],
  accessLevel: 'OWNER' as const,
  ownerUsername: 'me',
}

/** Route each document to its own payload — the hook fires two different queries. */
function respondWith(dimensions: unknown[], values: unknown[]) {
  mockQuery.mockImplementation(({ query }: { query: unknown }) => {
    if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
      return Promise.resolve({ data: { retrieveCategoryDimensions: dimensions } })
    }
    return Promise.resolve({ data: { retrieveCategoryValues: values } })
  })
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe('useCategoryOptions', () => {
  it('loads dimensions on mount and nothing else when no dimension is selected', async () => {
    respondWith([REGION], [])

    const { result } = renderHook(() => useCategoryOptions(''))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.dimensions).toEqual([REGION])
    expect(result.current.values).toEqual([])
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0]![0]).toMatchObject({
      query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
      fetchPolicy: 'cache-first',
    })
  })

  it('issues no query at all while disabled — a label query costs no taxonomy fetch', () => {
    respondWith([REGION], [EUROPE])

    const { result } = renderHook(() => useCategoryOptions('region', false))

    expect(mockQuery).not.toHaveBeenCalled()
    // Not "loading" either: nothing is in flight, so the picker must not claim to be waiting.
    expect(result.current.loading).toBe(false)
    expect(result.current.dimensions).toEqual([])
    expect(result.current.dimensionsAuthoritative).toBe(false)
  })

  it('starts loading when it becomes enabled, without a stale disabled state', async () => {
    respondWith([REGION], [EUROPE])

    const { result, rerender } = renderHook(
      ({ key, on }: { key: string; on: boolean }) => useCategoryOptions(key, on),
      { initialProps: { key: 'region', on: false } },
    )
    expect(mockQuery).not.toHaveBeenCalled()

    rerender({ key: 'region', on: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dimensions).toEqual([REGION])
    expect(result.current.values).toEqual([EUROPE])
  })

  it('loads the selected dimension values lazily, scoped by selector', async () => {
    respondWith([REGION], [EUROPE])

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.values).toEqual([EUROPE])
    const valuesCall = mockQuery.mock.calls.find(
      (call) => call[0].query === RETRIEVE_CATEGORY_VALUES_QUERY,
    )
    expect(valuesCall![0]).toMatchObject({
      variables: { selector: { dimensionKey: 'region' } },
      fetchPolicy: 'cache-first',
    })
  })

  it('does not refetch values for a dimension it already requested', async () => {
    respondWith([REGION], [EUROPE])

    const { result, rerender } = renderHook((key: string) => useCategoryOptions(key), {
      initialProps: 'region',
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender('region')

    const valueCalls = mockQuery.mock.calls.filter(
      (call) => call[0].query === RETRIEVE_CATEGORY_VALUES_QUERY,
    )
    expect(valueCalls).toHaveLength(1)
  })

  it('reports no values for a dimension whose values have not been requested', async () => {
    respondWith([REGION], [EUROPE])

    const { result, rerender } = renderHook((key: string) => useCategoryOptions(key), {
      initialProps: 'region',
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Switching to an unloaded dimension must not leak the previous dimension's values.
    rerender('team')
    expect(result.current.values).toEqual([])
  })

  it('treats a data-less response as empty rather than crashing', async () => {
    mockQuery.mockResolvedValue({ data: undefined })

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.dimensions).toEqual([])
    expect(result.current.values).toEqual([])
  })

  it('claims no authority over a response that fulfilled without a payload', async () => {
    mockQuery.mockResolvedValue({ data: undefined })

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // A settled promise is not an arrived list. Reading it as one would let the pickers annotate
    // the user's own stored keys "(not in your taxonomy)" on the strength of a malformed response
    // — the same false-authority defect as the session-expiry case, through a different door.
    expect(result.current.dimensionsAuthoritative).toBe(false)
    expect(result.current.valuesAuthoritative).toBe(false)
    expect(result.current.error).toBe('Could not load categories.')
  })

  it('surfaces a load failure and still resolves loading — never hangs', async () => {
    mockQuery.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Could not load categories.')
    expect(result.current.values).toEqual([])
  })

  it('requests the documented maximum page instead of accepting the default 25', async () => {
    respondWith([REGION], [EUROPE])

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // user-guide.md:1096 — pagination defaults to limit=25, max 100. Un-paginated, a dimension
    // with 26 values silently showed 25 and called the 26th "not in your taxonomy".
    expect(mockQuery.mock.calls[0]![0]).toMatchObject({ variables: { selector: { limit: 100 } } })
    const valuesCall = mockQuery.mock.calls.find((c) => c[0].query === RETRIEVE_CATEGORY_VALUES_QUERY)
    expect(valuesCall![0]).toMatchObject({ variables: { selector: { dimensionKey: 'region', limit: 100 } } })
  })

  it('forfeits authority over a full page — it may be truncated', async () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...EUROPE, key: `v-${i}`, displayName: `V${i}` }))
    respondWith([REGION], many)

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Nothing in the response distinguishes "exactly 100" from "the first 100 of more", so the
    // list must not be treated as complete — that is what licenses the "not in your taxonomy" note.
    expect(result.current.values).toHaveLength(100)
    expect(result.current.valuesAuthoritative).toBe(false)
    expect(result.current.dimensionsAuthoritative).toBe(true)
  })

  it('keeps a dimensions failure visible even when a values load succeeds', async () => {
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) return Promise.reject(new Error('network down'))
      return Promise.resolve({ data: { retrieveCategoryValues: [EUROPE] } })
    })

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // The dimension picker really is empty — clearing the notice here would hide that.
    expect(result.current.dimensions).toEqual([])
    expect(result.current.error).toBe('Could not load categories.')
    expect(result.current.dimensionsAuthoritative).toBe(false)
    // The values did load, so they are authoritative independently.
    expect(result.current.values).toEqual([EUROPE])
    expect(result.current.valuesAuthoritative).toBe(true)
  })

  it('reports each list as authoritative only once loaded and unfailed', async () => {
    respondWith([REGION], [EUROPE])

    const { result } = renderHook(() => useCategoryOptions('region'))
    expect(result.current.dimensionsAuthoritative).toBe(false)
    expect(result.current.valuesAuthoritative).toBe(false)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dimensionsAuthoritative).toBe(true)
    expect(result.current.valuesAuthoritative).toBe(true)
  })

  it('hides a values failure the moment the user selects another dimension', async () => {
    let failNext = true
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
        return Promise.resolve({ data: { retrieveCategoryDimensions: [REGION] } })
      }
      if (failNext) {
        failNext = false
        return Promise.reject(new Error('network down'))
      }
      return Promise.resolve({ data: { retrieveCategoryValues: [EUROPE] } })
    })

    const { result, rerender } = renderHook((key: string) => useCategoryOptions(key), {
      initialProps: 'broken',
    })
    await waitFor(() => expect(result.current.error).toBe('Could not load categories.'))

    // Asserted BEFORE the replacement load resolves, which is the whole point: the message is
    // derived from the selected dimension's own entry, so it goes with the selection rather than
    // lingering until some later success happens to clear it. A shared error scalar — the round-2
    // design — would still be reporting `broken`'s failure over a picker that is merely loading.
    rerender('region')
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.values).toEqual([EUROPE]))
    expect(result.current.error).toBeNull()
  })

  it('re-reports a dimension whose values failed when the user returns to it', async () => {
    mockQuery.mockImplementation(
      ({ query, variables }: { query: unknown; variables: { selector: { dimensionKey?: string } } }) => {
        if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
          return Promise.resolve({ data: { retrieveCategoryDimensions: [REGION] } })
        }
        if (variables.selector.dimensionKey === 'broken') return Promise.reject(new Error('network down'))
        return Promise.resolve({ data: { retrieveCategoryValues: [EUROPE] } })
      },
    )

    const { result, rerender } = renderHook((key: string) => useCategoryOptions(key), {
      initialProps: 'broken',
    })
    await waitFor(() => expect(result.current.error).toBe('Could not load categories.'))

    rerender('region')
    await waitFor(() => expect(result.current.values).toEqual([EUROPE]))
    expect(result.current.error).toBeNull()
    expect(result.current.valuesAuthoritative).toBe(true)

    // A shared error scalar was cleared by this success, but the empty-on-failure cache entry is
    // per-dimension and `requestedRef` blocks a refetch — so the failed dimension came back with
    // its empty list presented as the complete taxonomy, no error and no loading note.
    rerender('broken')
    expect(result.current.values).toEqual([])
    expect(result.current.error).toBe('Could not load categories.')
    expect(result.current.valuesAuthoritative).toBe(false)
    expect(result.current.loading).toBe(false)
  })

  it('prefers a recognised error code’s own message over the generic one', async () => {
    mockQuery.mockRejectedValue(new Error('AUTH-RATE-LIMITED'))

    const { result } = renderHook(() => useCategoryOptions(''))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Too many attempts. Please wait a moment and try again.')
  })

  it('handles a rejection that is not an Error object', async () => {
    mockQuery.mockRejectedValue('plain string failure')

    const { result } = renderHook(() => useCategoryOptions(''))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Could not load categories.')
  })

  it('stays silent on a session-expiry error — sign-out is handled globally', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))

    const { result } = renderHook(() => useCategoryOptions(''))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
  })

  it('claims no authority over a list a session-expiry failure left empty', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))

    const { result } = renderHook(() => useCategoryOptions('region'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // The message is suppressed on purpose (sign-out is global), so authority derived from the
    // MESSAGE reads true over a list that never loaded — and `optionsWithSelected` then annotates
    // the user's own stored key "(not in your taxonomy)" with nothing on screen to contradict it.
    expect(result.current.error).toBeNull()
    expect(result.current.dimensions).toEqual([])
    expect(result.current.dimensionsAuthoritative).toBe(false)
    expect(result.current.valuesAuthoritative).toBe(false)
  })

  describe('page-ceiling truncation', () => {
    /** `n` distinct values — the server returns at most 100 per read (user-guide.md:1096). */
    function manyValues(n: number) {
      return Array.from({ length: n }, (_, i) => ({ ...EUROPE, key: `v-${i}`, displayName: `V${i}` }))
    }

    it('reports a full value page as truncated, and forfeits authority over it', async () => {
      respondWith([REGION], manyValues(100))

      const { result } = renderHook(() => useCategoryOptions('region'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      // A full page may have more behind it and nothing in the response says which, so the
      // picker must neither claim the list is complete nor stay silent about the cut-off.
      expect(result.current.valuesTruncated).toBe(true)
      expect(result.current.valuesAuthoritative).toBe(false)
    })

    it('reports a short value page as complete and not truncated', async () => {
      respondWith([REGION], manyValues(99))

      const { result } = renderHook(() => useCategoryOptions('region'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.valuesTruncated).toBe(false)
      expect(result.current.valuesAuthoritative).toBe(true)
    })

    it('tracks dimension truncation independently of values', async () => {
      respondWith(manyValues(100).map((v) => ({ ...REGION, key: v.key })), [EUROPE])

      const { result } = renderHook(() => useCategoryOptions('region'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      expect(result.current.dimensionsTruncated).toBe(true)
      expect(result.current.dimensionsAuthoritative).toBe(false)
      expect(result.current.valuesTruncated).toBe(false)
    })

    it('claims no truncation for a list that has not arrived', () => {
      // Never resolves — an empty list mid-flight is not a truncated one.
      mockQuery.mockImplementation(() => new Promise(() => {}))

      const { result } = renderHook(() => useCategoryOptions('region'))

      expect(result.current.loading).toBe(true)
      expect(result.current.dimensionsTruncated).toBe(false)
      expect(result.current.valuesTruncated).toBe(false)
    })

    it('requests the documented maximum page size for both reads', async () => {
      respondWith([REGION], [EUROPE])

      const { result } = renderHook(() => useCategoryOptions('region'))
      await waitFor(() => expect(result.current.loading).toBe(false))

      for (const call of mockQuery.mock.calls) {
        expect(call[0].variables.selector).toMatchObject({ limit: 100 })
      }
    })
  })
})
