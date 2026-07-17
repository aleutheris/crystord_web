import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useLabelSuggestions } from './use-label-suggestions'
import { LIST_LABELS_QUERY } from '../../api-contract/graph-queries'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

beforeEach(() => {
  mockQuery.mockReset()
})

describe('useLabelSuggestions', () => {
  it('fetches all labels once with the empty prefix (cache-first)', async () => {
    mockQuery.mockResolvedValue({ data: { listLabels: ['Project', 'Task'] } })
    const { result } = renderHook(() => useLabelSuggestions())

    await waitFor(() => expect(result.current).toEqual(['Project', 'Task']))
    expect(mockQuery).toHaveBeenCalledTimes(1)
    expect(mockQuery).toHaveBeenCalledWith({
      query: LIST_LABELS_QUERY,
      variables: { prefix: '' },
      fetchPolicy: 'cache-first',
    })
  })

  it('stays empty when the response carries no data', async () => {
    mockQuery.mockResolvedValue({ data: undefined })
    const { result } = renderHook(() => useLabelSuggestions())

    await waitFor(() => expect(mockQuery).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })

  it('is silently empty on failure (best-effort autocomplete)', async () => {
    mockQuery.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useLabelSuggestions())

    await waitFor(() => expect(mockQuery).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })
})
