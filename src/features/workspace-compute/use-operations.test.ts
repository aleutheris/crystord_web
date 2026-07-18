import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useOperations } from './use-operations'
import { FALLBACK_OPERATIONS } from './operation-metadata'
import { DISCOVER_OPERATIONS_QUERY } from '../../api-contract/compute-operations'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

beforeEach(() => {
  mockQuery.mockReset()
})

describe('useOperations', () => {
  it('loads the discovered catalog once (cache-first)', async () => {
    const discovered = [{ name: 'SUM', description: 'Server sum' }, { name: 'CUSTOM', description: 'New op' }]
    mockQuery.mockResolvedValue({ data: { discoverOperations: discovered } })

    const { result } = renderHook(() => useOperations())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.operations).toEqual(discovered)
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery.mock.calls[0]![0]).toMatchObject({
      query: DISCOVER_OPERATIONS_QUERY,
      fetchPolicy: 'cache-first',
    })
  })

  it('keeps the built-in fallback on an empty discovery', async () => {
    mockQuery.mockResolvedValue({ data: { discoverOperations: [] } })

    const { result } = renderHook(() => useOperations())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.operations).toEqual(FALLBACK_OPERATIONS)
  })

  it('keeps the built-in fallback on a data-less response', async () => {
    mockQuery.mockResolvedValue({ data: undefined })

    const { result } = renderHook(() => useOperations())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.operations).toEqual(FALLBACK_OPERATIONS)
  })

  it('silently falls back to the built-ins on failure — the builder works offline', async () => {
    mockQuery.mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useOperations())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.operations).toEqual(FALLBACK_OPERATIONS)
  })
})
