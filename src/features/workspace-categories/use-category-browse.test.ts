import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCategoryBrowse } from './use-category-browse'
import {
  RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
  RETRIEVE_CATEGORY_BROWSE_QUERY,
  CREATE_CATEGORY_DIMENSION_MUTATION,
  CREATE_CATEGORY_VALUE_MUTATION,
  UPDATE_CATEGORY_DIMENSION_MUTATION,
  UPDATE_CATEGORY_VALUE_MUTATION,
  DELETE_CATEGORY_DIMENSION_MUTATION,
  DELETE_CATEGORY_VALUE_MUTATION,
  CONNECT_CATEGORY_DIMENSIONS_MUTATION,
  DISCONNECT_CATEGORY_DIMENSIONS_MUTATION,
} from '../../api-contract/category-operations'

const mockQuery = vi.fn()
const mockMutate = vi.fn()
// One stable client object — a fresh object per render would retrigger the mount effect
// (the real useApolloClient returns a stable client).
const mockClient = { query: mockQuery, mutate: mockMutate }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const DIMENSION = {
  key: 'region', displayName: 'Region', description: null, parentDimensionKeys: [], accessLevel: 'OWNER', ownerUsername: 'demo',
}

const EUROPE_CHILD = {
  value: { key: 'europe', displayName: 'Europe', dimensionKey: 'region', parentValueKeys: [], accessLevel: 'OWNER' },
  atomCount: 3,
}

function mockHappyQueries() {
  mockQuery.mockImplementation(({ query }: { query: unknown }) => {
    if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
      return Promise.resolve({ data: { retrieveCategoryDimensions: [DIMENSION] } })
    }
    return Promise.resolve({ data: { retrieveCategoryBrowse: { value: null, children: [EUROPE_CHILD] } } })
  })
}

beforeEach(() => {
  mockQuery.mockReset()
  mockMutate.mockReset()
})

async function renderBrowse() {
  const rendered = renderHook(() => useCategoryBrowse())
  await waitFor(() => expect(rendered.result.current.loading).toBe(false))
  return rendered
}

describe('useCategoryBrowse dimensions load', () => {
  it('loads dimensions network-only on mount', async () => {
    mockHappyQueries()
    const { result } = await renderBrowse()
    expect(result.current.dimensions).toEqual([DIMENSION])
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
      fetchPolicy: 'network-only',
    }))
  })

  it('treats a missing data payload as an empty dimension list', async () => {
    mockQuery.mockResolvedValue({ data: undefined })
    const { result } = await renderBrowse()
    expect(result.current.dimensions).toEqual([])
    expect(result.current.loadError).toBeNull()
  })

  it('surfaces a generic message for an unknown load failure', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    const { result } = await renderBrowse()
    expect(result.current.loadError).toBe('Could not load categories.')
  })

  it('maps a recognized access code to its user-facing message', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = await renderBrowse()
    expect(result.current.loadError).toMatch(/don't have access/i)
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = await renderBrowse()
    expect(result.current.loadError).toBeNull()
  })

  it('stringifies non-Error load failures', async () => {
    mockQuery.mockRejectedValue('plain failure')
    const { result } = await renderBrowse()
    expect(result.current.loadError).toBe('Could not load categories.')
  })
})

describe('useCategoryBrowse lazy children', () => {
  it('browses a dimension node by dimensionKey and caches its children', async () => {
    mockHappyQueries()
    const { result } = await renderBrowse()

    act(() => result.current.loadChildren({ kind: 'dimension', key: 'region' }))
    await waitFor(() => expect(result.current.childrenByNode.get('region')).toEqual([EUROPE_CHILD]))

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      variables: { dimensionKey: 'region' },
      fetchPolicy: 'network-only',
    }))
  })

  it('browses a value node by valueKey', async () => {
    mockHappyQueries()
    const { result } = await renderBrowse()

    act(() => result.current.loadChildren({ kind: 'value', key: 'europe' }))
    await waitFor(() => expect(result.current.childrenByNode.has('europe')).toBe(true))

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      variables: { valueKey: 'europe' },
    }))
  })

  it('loads each node once — repeat loadChildren calls are deduped', async () => {
    mockHappyQueries()
    const { result } = await renderBrowse()

    act(() => result.current.loadChildren({ kind: 'dimension', key: 'region' }))
    await waitFor(() => expect(result.current.childrenByNode.has('region')).toBe(true))
    act(() => result.current.loadChildren({ kind: 'dimension', key: 'region' }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const browseCalls = mockQuery.mock.calls.filter(([args]) => args.query === RETRIEVE_CATEGORY_BROWSE_QUERY)
    expect(browseCalls).toHaveLength(1)
  })

  it('a failed load surfaces the error and allows a retry', async () => {
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
        return Promise.resolve({ data: { retrieveCategoryDimensions: [DIMENSION] } })
      }
      return Promise.reject(new Error('browse down'))
    })
    const { result } = await renderBrowse()

    act(() => result.current.loadChildren({ kind: 'dimension', key: 'region' }))
    await waitFor(() => expect(result.current.loadError).toBe('Could not load categories.'))

    mockHappyQueries()
    act(() => result.current.loadChildren({ kind: 'dimension', key: 'region' }))
    await waitFor(() => expect(result.current.childrenByNode.get('region')).toEqual([EUROPE_CHILD]))
  })

  it('treats a missing browse payload as empty children', async () => {
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === RETRIEVE_CATEGORY_DIMENSIONS_QUERY) {
        return Promise.resolve({ data: { retrieveCategoryDimensions: [DIMENSION] } })
      }
      return Promise.resolve({ data: undefined })
    })
    const { result } = await renderBrowse()

    act(() => result.current.loadChildren({ kind: 'dimension', key: 'region' }))
    await waitFor(() => expect(result.current.childrenByNode.get('region')).toEqual([]))
  })
})

describe('useCategoryBrowse authoring mutations', () => {
  it('createDimension runs the mutation and refreshes the dimension list', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { createCategoryDimension: { key: 'period' } } })
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    let ok = false
    await act(async () => { ok = await result.current.createDimension('period', 'Period') })

    expect(ok).toBe(true)
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_CATEGORY_DIMENSION_MUTATION,
      variables: { key: 'period', displayName: 'Period' },
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY }))
  })

  it('a refresh returning no data payload resets the dimension list to empty', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { createCategoryDimension: { key: 'period' } } })
    const { result } = await renderBrowse()

    mockQuery.mockResolvedValue({ data: undefined })
    await act(async () => { await result.current.createDimension('period', 'Period') })

    expect(result.current.dimensions).toEqual([])
  })

  it('createValue under a dimension node sends no parentValueKeys and refreshes that dimension', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { createCategoryValue: { key: 'asia' } } })
    const { result } = await renderBrowse()

    await act(async () => {
      await result.current.createValue('asia', 'Asia', 'region', { kind: 'dimension', key: 'region' })
    })

    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_CATEGORY_VALUE_MUTATION,
      variables: { key: 'asia', displayName: 'Asia', dimensionKey: 'region' },
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      variables: { dimensionKey: 'region' },
    }))
    expect(result.current.childrenByNode.get('region')).toEqual([EUROPE_CHILD])
  })

  it('createValue under a value node nests via parentValueKeys and refreshes that value', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { createCategoryValue: { key: 'belgium' } } })
    const { result } = await renderBrowse()

    await act(async () => {
      await result.current.createValue('belgium', 'Belgium', 'region', { kind: 'value', key: 'europe' })
    })

    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_CATEGORY_VALUE_MUTATION,
      variables: { key: 'belgium', displayName: 'Belgium', dimensionKey: 'region', parentValueKeys: ['europe'] },
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      variables: { valueKey: 'europe' },
    }))
  })

  it('renameNode on a dimension updates displayName and refreshes the list', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { updateCategoryDimension: { key: 'region' } } })
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    await act(async () => {
      await result.current.renameNode({ kind: 'dimension', key: 'region' }, 'Regions', null)
    })

    expect(mockMutate).toHaveBeenCalledWith({
      mutation: UPDATE_CATEGORY_DIMENSION_MUTATION,
      variables: { key: 'region', displayName: 'Regions' },
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY }))
  })

  it('renameNode on a value refreshes its parent children', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { updateCategoryValue: { key: 'europe' } } })
    const { result } = await renderBrowse()

    await act(async () => {
      await result.current.renameNode({ kind: 'value', key: 'europe' }, 'EU', { kind: 'dimension', key: 'region' })
    })

    expect(mockMutate).toHaveBeenCalledWith({
      mutation: UPDATE_CATEGORY_VALUE_MUTATION,
      variables: { key: 'europe', displayName: 'EU' },
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      variables: { dimensionKey: 'region' },
    }))
  })

  it('renameNode on a value without a known parent skips the refresh', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { updateCategoryValue: { key: 'europe' } } })
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    await act(async () => {
      await result.current.renameNode({ kind: 'value', key: 'europe' }, 'EU', null)
    })

    expect(mockQuery).not.toHaveBeenCalled()
  })

  it('removeNode on a value deletes it, drops its stale cache, and refreshes the parent', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { deleteCategoryValue: true } })
    const { result } = await renderBrowse()

    act(() => result.current.loadChildren({ kind: 'value', key: 'europe' }))
    await waitFor(() => expect(result.current.childrenByNode.has('europe')).toBe(true))

    await act(async () => {
      await result.current.removeNode({ kind: 'value', key: 'europe' }, { kind: 'dimension', key: 'region' })
    })

    expect(mockMutate).toHaveBeenCalledWith({
      mutation: DELETE_CATEGORY_VALUE_MUTATION,
      variables: { key: 'europe' },
    })
    expect(result.current.childrenByNode.has('europe')).toBe(false)
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      variables: { dimensionKey: 'region' },
    }))
  })

  it('removeNode on a dimension deletes it and refreshes the dimension list', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { deleteCategoryDimension: true } })
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    let ok = false
    await act(async () => { ok = await result.current.removeNode({ kind: 'dimension', key: 'region' }, null) })

    expect(ok).toBe(true)
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: DELETE_CATEGORY_DIMENSION_MUTATION,
      variables: { key: 'region' },
    })
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY }))
  })

  it('removeNode on a value without a known parent skips the refresh', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { deleteCategoryValue: true } })
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    await act(async () => {
      await result.current.removeNode({ kind: 'value', key: 'europe' }, null)
    })

    expect(mockQuery).not.toHaveBeenCalled()
  })
})

describe('useCategoryBrowse dimension hierarchy (ADR-260071)', () => {
  /** Mutation docs in call order — the move is two calls and the order is load-bearing. */
  function mutationSequence() {
    return mockMutate.mock.calls.map(([args]) => args.mutation)
  }

  it('createDimension with a parent wires it at creation via parentDimensionKeys', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { createCategoryDimension: { key: 'country' } } })
    const { result } = await renderBrowse()

    let ok = false
    await act(async () => { ok = await result.current.createDimension('country', 'Country', 'region') })

    expect(ok).toBe(true)
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_CATEGORY_DIMENSION_MUTATION,
      variables: { key: 'country', displayName: 'Country', parentDimensionKeys: ['region'] },
    })
  })

  it('createDimension with an explicitly null parent omits parentDimensionKeys entirely', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { createCategoryDimension: { key: 'period' } } })
    const { result } = await renderBrowse()

    await act(async () => { await result.current.createDimension('period', 'Period', null) })

    // Sending an explicit null would ask the backend to clear the edge rather than skip it.
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_CATEGORY_DIMENSION_MUTATION,
      variables: { key: 'period', displayName: 'Period' },
    })
  })

  it('attaching a root dimension issues only connect — there is nothing to detach', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { connectCategoryDimensions: { key: 'country' } } })
    const { result } = await renderBrowse()

    let ok = false
    await act(async () => { ok = await result.current.setDimensionParent('country', null, 'region') })

    expect(ok).toBe(true)
    expect(mutationSequence()).toEqual([CONNECT_CATEGORY_DIMENSIONS_MUTATION])
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CONNECT_CATEGORY_DIMENSIONS_MUTATION,
      variables: { dimensionKey: 'country', parentDimensionKeys: ['region'] },
    })
  })

  it('detaching to a root issues only disconnect', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { disconnectCategoryDimensions: { key: 'country' } } })
    const { result } = await renderBrowse()

    let ok = false
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', null) })

    expect(ok).toBe(true)
    expect(mutationSequence()).toEqual([DISCONNECT_CATEGORY_DIMENSIONS_MUTATION])
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: DISCONNECT_CATEGORY_DIMENSIONS_MUTATION,
      variables: { dimensionKey: 'country', parentDimensionKeys: ['region'] },
    })
  })

  it('moving between parents disconnects before connecting', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { connectCategoryDimensions: { key: 'country' } } })
    const { result } = await renderBrowse()

    await act(async () => { await result.current.setDimensionParent('country', 'region', 'period') })

    // Connecting first would hit CAT-MULTIPLE-PARENTS-UNSUPPORTED — UNDER_CATDIM is single-parent.
    expect(mutationSequence()).toEqual([
      DISCONNECT_CATEGORY_DIMENSIONS_MUTATION,
      CONNECT_CATEGORY_DIMENSIONS_MUTATION,
    ])
  })

  it('still reports the move failure when the recovery refresh also fails', async () => {
    // Both halves down: the mutation fails, and the refresh issued to resync the rail fails too.
    // The move error is what the user needs; the failed resync must not mask it or throw.
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('CAT-DIMENSION-CYCLE'))
    const { result } = await renderBrowse()
    mockQuery.mockRejectedValue(new Error('Failed to fetch'))

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', 'period') })

    expect(ok).toBe(false)
    expect(result.current.mutationError).toMatch(/dimension inside itself/i)
  })

  it('surfaces a non-Error rejection from a move', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue('connection reset')
    const { result } = await renderBrowse()

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setDimensionParent('country', null, 'region') })

    expect(ok).toBe(false)
    expect(result.current.mutationError).toContain('connection reset')
  })

  it('does not report a completed move as half-done when only the refresh fails', async () => {
    // Regression: refreshDimensions() ran inside the same try as the mutations, so a transient
    // failure re-fetching the list landed in the catch with `detached` still true and told the user
    // the dimension was left at the top level — the exact inverse of the server state, where both
    // mutations had succeeded and the move was complete.
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { connectCategoryDimensions: { key: 'country' } } })
    const { result } = await renderBrowse()
    mockQuery.mockRejectedValue(new Error('Failed to fetch'))

    let ok: boolean | undefined
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', 'period') })

    expect(mockMutate).toHaveBeenCalledTimes(2)
    expect(ok).toBe(true)
    expect(result.current.mutationError).toBeNull()
    // The move succeeded but the rail is now stale — that belongs on the load channel.
    expect(result.current.loadError).not.toBeNull()
  })

  it('refreshes the dimension list after a successful move', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValue({ data: { connectCategoryDimensions: { key: 'country' } } })
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    await act(async () => { await result.current.setDimensionParent('country', 'region', 'period') })

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY }))
  })

  it('re-selecting the current parent is a no-op — no mutations, still succeeds', async () => {
    mockHappyQueries()
    const { result } = await renderBrowse()

    let ok = false
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', 'region') })

    expect(ok).toBe(true)
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('leaving an already-root dimension at root is a no-op', async () => {
    mockHappyQueries()
    const { result } = await renderBrowse()

    let ok = false
    await act(async () => { ok = await result.current.setDimensionParent('region', null, null) })

    expect(ok).toBe(true)
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('reports the dimension as top-level when the detach lands but the attach fails', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValueOnce({ data: { disconnectCategoryDimensions: { key: 'country' } } })
    mockMutate.mockRejectedValueOnce(new Error('CAT-DIMENSION-NOT-FOUND: no such parent'))
    const { result } = await renderBrowse()

    let ok = true
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', 'period') })

    // The move is not atomic: the user must learn the dimension moved to the root, not that
    // nothing happened, or they will re-read the rail as unchanged.
    expect(ok).toBe(false)
    expect(result.current.mutationError).toContain('CAT-DIMENSION-NOT-FOUND: no such parent')
    expect(result.current.mutationError).toMatch(/top-level/i)
    expect(result.current.mutationError).toContain('country')
  })

  it('refreshes the dimension list after a half-completed move', async () => {
    mockHappyQueries()
    mockMutate.mockResolvedValueOnce({ data: { disconnectCategoryDimensions: { key: 'country' } } })
    mockMutate.mockRejectedValueOnce(new Error('CAT-DIMENSION-CYCLE'))
    const { result } = await renderBrowse()
    mockQuery.mockClear()

    await act(async () => { await result.current.setDimensionParent('country', 'region', 'period') })

    // Server state changed even though the move failed — the rail must not keep the old hierarchy.
    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY }))
  })

  it('a failing disconnect does not claim the dimension became top-level', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('CAT-DIMENSION-NOT-FOUND'))
    const { result } = await renderBrowse()

    let ok = true
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', 'period') })

    // Nothing was detached, so the dimension still sits under its original parent.
    expect(ok).toBe(false)
    expect(result.current.mutationError).toBe('CAT-DIMENSION-NOT-FOUND')
  })

  it('a failing attach on a root dimension does not claim it became top-level', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('CAT-DIMENSION-CYCLE'))
    const { result } = await renderBrowse()

    let ok = true
    await act(async () => { ok = await result.current.setDimensionParent('country', null, 'region') })

    // It was already a root — reporting a change would be false.
    expect(ok).toBe(false)
    expect(result.current.mutationError).not.toMatch(/top-level/i)
  })

  it('maps CAT-MULTIPLE-PARENTS-UNSUPPORTED to its guidance message', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('CAT-MULTIPLE-PARENTS-UNSUPPORTED'))
    const { result } = await renderBrowse()

    await act(async () => { await result.current.setDimensionParent('country', null, 'region') })

    expect(result.current.mutationError).toMatch(/only one parent/i)
    expect(result.current.mutationError).not.toContain('CAT-MULTIPLE-PARENTS-UNSUPPORTED')
  })

  it('maps CAT-DIMENSION-CYCLE to its guidance message', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('CAT-DIMENSION-CYCLE'))
    const { result } = await renderBrowse()

    await act(async () => { await result.current.setDimensionParent('region', null, 'country') })

    expect(result.current.mutationError).toMatch(/inside itself/i)
    expect(result.current.mutationError).not.toContain('CAT-DIMENSION-CYCLE')
  })

  it('stays silent on session expiry during a move', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = await renderBrowse()

    let ok = true
    await act(async () => { ok = await result.current.setDimensionParent('country', 'region', 'period') })

    expect(ok).toBe(false)
    expect(result.current.mutationError).toBeNull()
  })

  it('a new move clears the previous mutation error', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValueOnce(new Error('CAT-DIMENSION-CYCLE'))
    mockMutate.mockResolvedValue({ data: { connectCategoryDimensions: { key: 'country' } } })
    const { result } = await renderBrowse()

    await act(async () => { await result.current.setDimensionParent('country', null, 'region') })
    expect(result.current.mutationError).toMatch(/inside itself/i)

    await act(async () => { await result.current.setDimensionParent('country', null, 'period') })
    expect(result.current.mutationError).toBeNull()
  })
})

describe('useCategoryBrowse authoring errors (CAT-* verbatim — ADR-260064)', () => {
  it('surfaces an unrecognized backend code verbatim (raw message carries the CAT code)', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('CAT-DIMENSION-NOT-EMPTY: delete its values first'))
    const { result } = await renderBrowse()

    let ok = true
    await act(async () => { ok = await result.current.removeNode({ kind: 'dimension', key: 'region' }, null) })

    expect(ok).toBe(false)
    expect(result.current.mutationError).toBe('CAT-DIMENSION-NOT-EMPTY: delete its values first')
  })

  it('maps a recognized auth code to its user-facing message', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = await renderBrowse()

    await act(async () => { await result.current.createDimension('x', 'X') })

    expect(result.current.mutationError).toMatch(/don't have access/i)
  })

  it('stays silent on session expiry during authoring', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = await renderBrowse()

    let ok = true
    await act(async () => { ok = await result.current.createDimension('x', 'X') })

    expect(ok).toBe(false)
    expect(result.current.mutationError).toBeNull()
  })

  it('stringifies non-Error authoring failures', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValue('taxonomy offline')
    const { result } = await renderBrowse()

    await act(async () => { await result.current.createDimension('x', 'X') })

    expect(result.current.mutationError).toBe('taxonomy offline')
  })

  it('a new mutation clears the previous mutation error', async () => {
    mockHappyQueries()
    mockMutate.mockRejectedValueOnce(new Error('CAT-KEY-EXISTS'))
    mockMutate.mockResolvedValue({ data: { createCategoryDimension: { key: 'x' } } })
    const { result } = await renderBrowse()

    await act(async () => { await result.current.createDimension('x', 'X') })
    expect(result.current.mutationError).toBe('CAT-KEY-EXISTS')

    await act(async () => { await result.current.createDimension('x', 'X') })
    expect(result.current.mutationError).toBeNull()
  })
})
