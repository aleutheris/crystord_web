import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTaxonomy } from './use-taxonomy'
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

describe('useTaxonomy — dimensions load', () => {
  it('loads all dimensions once on mount (cache-first)', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useTaxonomy([]))

    await waitFor(() => expect(result.current.dimensions).toEqual(DIMENSIONS))
    expect(dimensionCalls()).toHaveLength(1)
    expect(dimensionCalls()[0]![0].fetchPolicy).toBe('cache-first')
    expect(result.current.error).toBeNull()
  })

  it('treats a data-less response as no dimensions', async () => {
    mockTaxonomyBackend({ dimensions: undefined })
    const { result } = renderHook(() => useTaxonomy([]))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dimensions).toEqual([])
  })

  it('is loading while the dimensions query is in flight, and not after', async () => {
    let resolve!: (v: unknown) => void
    mockQuery.mockReturnValue(new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useTaxonomy([]))

    expect(result.current.loading).toBe(true)
    await act(async () => resolve({ data: { retrieveCategoryDimensions: DIMENSIONS } }))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('surfaces a generic message on an unknown load failure', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    const { result } = renderHook(() => useTaxonomy([]))

    await waitFor(() => expect(result.current.error).toBe('Could not load categories.'))
  })

  it('surfaces the mapped message for a known access-error code', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useTaxonomy([]))

    await waitFor(() => expect(result.current.error).toMatch(/don't have access/i))
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useTaxonomy([]))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('stringifies a non-Error rejection into the generic message path', async () => {
    mockQuery.mockRejectedValue('string failure')
    const { result } = renderHook(() => useTaxonomy([]))

    await waitFor(() => expect(result.current.error).toBe('Could not load categories.'))
  })
})

describe('useTaxonomy — lazy values load', () => {
  it('loadValues fetches one dimension with a dimensionKey selector and caches it', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useTaxonomy([]))

    act(() => result.current.loadValues('region'))

    await waitFor(() => expect(result.current.valuesByDimension.get('region')).toEqual(REGION_VALUES))
    expect(valueCalls()).toHaveLength(1)
    expect(valueCalls()[0]![0].variables).toEqual({ selector: { dimensionKey: 'region' } })
    expect(valueCalls()[0]![0].fetchPolicy).toBe('cache-first')
  })

  it('dedupes repeat loadValues calls for the same dimension', async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useTaxonomy([]))

    act(() => result.current.loadValues('region'))
    act(() => result.current.loadValues('region'))
    await waitFor(() => expect(result.current.valuesByDimension.has('region')).toBe(true))
    act(() => result.current.loadValues('region'))

    expect(valueCalls()).toHaveLength(1)
  })

  it('treats a data-less values response as an empty list', async () => {
    mockTaxonomyBackend({ values: undefined })
    const { result } = renderHook(() => useTaxonomy([]))

    act(() => result.current.loadValues('region'))

    await waitFor(() => expect(result.current.valuesByDimension.get('region')).toEqual([]))
  })

  it('surfaces a values load failure and allows a retry', async () => {
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
        return Promise.resolve({ data: { retrieveCategoryDimensions: DIMENSIONS } })
      }
      return valueCalls().length > 1
        ? Promise.resolve({ data: { retrieveCategoryValues: REGION_VALUES } })
        : Promise.reject(new Error('kaboom'))
    })
    const { result } = renderHook(() => useTaxonomy([]))

    act(() => result.current.loadValues('region'))
    await waitFor(() => expect(result.current.error).toBe('Could not load categories.'))
    expect(result.current.valuesByDimension.has('region')).toBe(false)

    // The failed key was released — a retry issues a second query and succeeds.
    act(() => result.current.loadValues('region'))
    await waitFor(() => expect(result.current.valuesByDimension.get('region')).toEqual(REGION_VALUES))
    expect(valueCalls()).toHaveLength(2)
  })

  it("auto-loads values for the atom's assigned dimensions on mount", async () => {
    mockTaxonomyBackend()
    const { result } = renderHook(() => useTaxonomy(['region']))

    await waitFor(() => expect(result.current.valuesByDimension.get('region')).toEqual(REGION_VALUES))
    expect(valueCalls()).toHaveLength(1)
  })
})
