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
