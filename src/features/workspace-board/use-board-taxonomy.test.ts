import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBoardTaxonomy } from './use-board-taxonomy'
import {
  RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
  RETRIEVE_CATEGORY_VALUES_QUERY,
} from '../../api-contract/category-operations'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const DIMENSIONS = [
  { key: 'region', displayName: 'Region', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
  { key: 'period', displayName: 'Period', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]
const REGION_VALUES = [
  { key: 'europe', displayName: 'Europe', description: null, dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo' },
]

function mockTaxonomyBackend(overrides?: { dimensions?: unknown; values?: unknown }) {
  mockQuery.mockImplementation(({ query }: { query: unknown }) => {
    if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
      return Promise.resolve({ data: overrides && 'dimensions' in overrides ? overrides.dimensions : { retrieveCategoryDimensions: DIMENSIONS } })
    }
    return Promise.resolve({ data: overrides && 'values' in overrides ? overrides.values : { retrieveCategoryValues: REGION_VALUES } })
  })
}

function dimensionCalls() {
  return mockQuery.mock.calls.filter(([args]) => args.query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY)
}

function valueCalls() {
  return mockQuery.mock.calls.filter(([args]) => args.query === RETRIEVE_CATEGORY_VALUES_QUERY)
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe('useBoardTaxonomy — dimensions load', () => {
  it('loads all dimensions once on mount (cache-first)', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.dimensions).toEqual(DIMENSIONS))
    expect(dimensionCalls()).toHaveLength(1)
    expect(dimensionCalls()[0]![0].fetchPolicy).toBe('cache-first')
    expect(result.current.error).toBeNull()
    expect(result.current.chosenDimensionKey).toBeNull()
    expect(result.current.values).toBeNull()
  })

  it('treats a data-less response as no dimensions', async () => {
    mockTaxonomyBackend({ dimensions: undefined })
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dimensions).toEqual([])
  })

  it('is loading while the dimensions query is in flight, and not after', async () => {
    let resolve!: (v: unknown) => void
    mockQuery.mockReturnValue(new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useBoardTaxonomy())

    expect(result.current.loading).toBe(true)
    await act(async () => resolve({ data: { retrieveCategoryDimensions: DIMENSIONS } }))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('surfaces the mapped message for a known access-error code', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.error).toMatch(/don't have access/i))
  })

  it('falls back to the raw message on an unknown load failure', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.error).toBe('kaboom'))
  })

  it('falls back to the generic message when the failure carries no text', async () => {
    mockQuery.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.error).toBe('Could not load categories.'))
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('stringifies a non-Error rejection into the raw-message path', async () => {
    mockQuery.mockRejectedValue('string failure')
    const { result } = renderHook(() => useBoardTaxonomy())

    await waitFor(() => expect(result.current.error).toBe('string failure'))
  })
})

describe('useBoardTaxonomy — choosing a dimension', () => {
  it('chooseDimension sets the key and fetches that dimension full value list (cache-first)', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useBoardTaxonomy())

    act(() => result.current.chooseDimension('region'))

    expect(result.current.chosenDimensionKey).toBe('region')
    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
    expect(valueCalls()).toHaveLength(1)
    expect(valueCalls()[0]![0].variables).toEqual({ selector: { dimensionKey: 'region' } })
    expect(valueCalls()[0]![0].fetchPolicy).toBe('cache-first')
  })

  it('values stay null while the chosen dimension load is in flight', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useBoardTaxonomy())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let resolve!: (v: unknown) => void
    mockQuery.mockReturnValue(new Promise((res) => { resolve = res }))
    act(() => result.current.chooseDimension('region'))

    expect(result.current.values).toBeNull()
    expect(result.current.loading).toBe(true)
    await act(async () => resolve({ data: { retrieveCategoryValues: REGION_VALUES } }))
    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
  })

  it('caches per key — re-choosing a loaded dimension issues no second query', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useBoardTaxonomy())

    act(() => result.current.chooseDimension('region'))
    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
    act(() => result.current.chooseDimension('period'))
    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
    act(() => result.current.chooseDimension('region'))

    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
    expect(valueCalls()).toHaveLength(2)
  })

  it('an empty key returns to the prompt state without querying', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useBoardTaxonomy())

    act(() => result.current.chooseDimension('region'))
    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
    act(() => result.current.chooseDimension(''))

    expect(result.current.chosenDimensionKey).toBeNull()
    expect(result.current.values).toBeNull()
    expect(valueCalls()).toHaveLength(1)
  })

  it('treats a data-less values response as an empty list', async () => {
    mockTaxonomyBackend({ values: undefined })
    const { result } = renderHook(() => useBoardTaxonomy())

    act(() => result.current.chooseDimension('region'))

    await waitFor(() => expect(result.current.values).toEqual([]))
  })

  it('surfaces a values load failure and allows a retry by re-choosing', async () => {
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
        return Promise.resolve({ data: { retrieveCategoryDimensions: DIMENSIONS } })
      }
      return valueCalls().length > 1
        ? Promise.resolve({ data: { retrieveCategoryValues: REGION_VALUES } })
        : Promise.reject(new Error('kaboom'))
    })
    const { result } = renderHook(() => useBoardTaxonomy())

    act(() => result.current.chooseDimension('region'))
    await waitFor(() => expect(result.current.error).toBe('kaboom'))
    expect(result.current.values).toBeNull()

    // The failed key was released — re-choosing issues a second query and succeeds.
    act(() => result.current.chooseDimension('region'))
    await waitFor(() => expect(result.current.values).toEqual(REGION_VALUES))
    expect(valueCalls()).toHaveLength(2)
  })
})
