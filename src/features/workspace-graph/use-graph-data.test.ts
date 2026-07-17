import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGraphData } from './use-graph-data'
import { RETRIEVE_QUERY, UPDATE_ATOM_MUTATION } from '../../api-contract/graph-queries'

const mockQuery = vi.fn()
const mockMutate = vi.fn()

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => ({ query: mockQuery, mutate: mockMutate }),
}))

beforeEach(() => {
  mockQuery.mockReset()
  mockMutate.mockReset()
})

const emptyRetrieve = { data: { retrieve: [] } }

describe('useGraphData search', () => {
  it('search sends committed labels as query variables', async () => {
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Project', 'Task']))

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_QUERY,
      variables: { labels: ['Project', 'Task'] },
    }))
  })

  it('search with empty labels fetches without label variables', async () => {
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search([]))

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      query: RETRIEVE_QUERY,
      variables: undefined,
    }))
  })

  it('refetch after search re-uses the last committed labels', async () => {
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Project']))
    mockQuery.mockClear()

    await act(() => result.current.refetch())

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      variables: { labels: ['Project'] },
    }))
  })

  it('repeated identical search triggers two separate backend queries', async () => {
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Project']))
    await act(() => result.current.search(['Project']))

    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('search uses network-only fetch policy to bypass Apollo cache', async () => {
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Task']))

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({
      fetchPolicy: 'network-only',
    }))
  })

  it('atoms are populated from backend response', async () => {
    const atom = {
      labels: ['Project'],
      bonds: [],
      properties: {
        shellies: { uuid: 'u1' },
        nuclearies: { title: 'Alpha', description: '', content: '', operation: null, constants: null },
      },
    }
    mockQuery.mockResolvedValue({ data: { retrieve: [atom] } })
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Project']))

    expect(result.current.atoms).toHaveLength(1)
    expect(result.current.atoms[0]!.properties.shellies.uuid).toBe('u1')
  })
})

describe('useGraphData bond mutations', () => {
  it('addBond strips __typename from nuclearies mutation input', async () => {
    const atom = {
      labels: ['Project'],
      bonds: [],
      properties: {
        shellies: { uuid: 'u1' },
        nuclearies: {
          __typename: 'NucleariesOutput',
          title: 'var1',
          description: '',
          content: '1',
          operation: '',
          constants: {},
        },
      },
    }
    mockQuery.mockResolvedValue({ data: { retrieve: [atom] } })
    mockMutate.mockResolvedValue({ data: { change: ['u1'] } })
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Project']))
    await act(() => result.current.addBond('u1', 'u2', 'depends_on'))

    const updateCall = mockMutate.mock.calls.find(
      ([args]) => args.mutation === UPDATE_ATOM_MUTATION,
    )
    expect(updateCall).toBeDefined()
    expect(updateCall?.[0].variables.inputs[0].properties.nuclearies).toEqual({
      title: 'var1',
      description: '',
      content: '1',
      operation: '',
      constants: {},
    })
  })

  it('updateAtom omits OP_DEPENDENCY bonds from the backend payload', async () => {
    const atom = {
      labels: ['Math'],
      bonds: [
        { uuid: 'op1', name: 'OP_DEPENDENCY', direction: 'from' },
        { uuid: 'u2', name: 'depends_on', direction: 'from' },
      ],
      properties: {
        shellies: { uuid: 'u1' },
        nuclearies: {
          __typename: 'NucleariesOutput',
          title: 'var1',
          description: '',
          content: '1',
          operation: '',
          constants: {},
        },
      },
    }
    mockQuery.mockResolvedValue({ data: { retrieve: [atom] } })
    mockMutate.mockResolvedValue({ data: { change: ['u1'] } })
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Math']))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await act(() => result.current.updateAtom('u1', atom as any))

    const updateCall = mockMutate.mock.calls.find(
      ([args]) => args.mutation === UPDATE_ATOM_MUTATION,
    )
    expect(updateCall).toBeDefined()
    expect(updateCall?.[0].variables.inputs[0].bonds).toEqual([
      { uuid: 'u2', name: 'depends_on', direction: 'from' },
    ])
  })

  it('removeBond strips __typename from nuclearies mutation input', async () => {
    const atom = {
      labels: ['Project'],
      bonds: [{ uuid: 'u2', name: 'depends_on', direction: 'from', __typename: 'BondOutput' }],
      properties: {
        shellies: { uuid: 'u1' },
        nuclearies: {
          __typename: 'NucleariesOutput',
          title: 'var1',
          description: '',
          content: '1',
          operation: '',
          constants: {},
        },
      },
    }
    mockQuery.mockResolvedValue({ data: { retrieve: [atom] } })
    mockMutate.mockResolvedValue({ data: { change: ['u1'] } })
    const { result } = renderHook(() => useGraphData())

    await act(() => result.current.search(['Project']))
    await act(() => result.current.removeBond('u1', 'u2', 'depends_on'))

    const updateCall = mockMutate.mock.calls.find(
      ([args]) => args.mutation === UPDATE_ATOM_MUTATION,
    )
    expect(updateCall).toBeDefined()
    expect(updateCall?.[0].variables.inputs[0].properties.nuclearies).toEqual({
      title: 'var1',
      description: '',
      content: '1',
      operation: '',
      constants: {},
    })
  })
})

describe('useGraphData category round-trip (ADR-260063 / EPIC-260067)', () => {
  const baseAtom = {
    labels: ['Project'],
    bonds: [],
    properties: {
      shellies: { uuid: 'u1' },
      nuclearies: { title: 'A', description: '', content: '', operation: '', constants: {} },
    },
  }

  it('updateAtom maps atom.categories to replace-all [{ valueKey }] inputs', async () => {
    mockMutate.mockResolvedValue({ data: { change: ['u1'] } })
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    const atom = {
      ...baseAtom,
      categories: [
        { dimensionKey: 'region', valueKey: 'belgium' },
        { dimensionKey: 'period', valueKey: 'q1' },
      ],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await act(() => result.current.updateAtom('u1', atom as any))

    const updateCall = mockMutate.mock.calls.find(
      ([args]) => args.mutation === UPDATE_ATOM_MUTATION,
    )
    expect(updateCall?.[0].variables.inputs[0].categories).toEqual([
      { valueKey: 'belgium' },
      { valueKey: 'q1' },
    ])
  })

  it('updateAtom sends an empty categories array as an explicit clear-all', async () => {
    mockMutate.mockResolvedValue({ data: { change: ['u1'] } })
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await act(() => result.current.updateAtom('u1', { ...baseAtom, categories: [] } as any))

    const updateCall = mockMutate.mock.calls.find(
      ([args]) => args.mutation === UPDATE_ATOM_MUTATION,
    )
    expect(updateCall?.[0].variables.inputs[0].categories).toEqual([])
  })

  it('updateAtom omits the categories field entirely for an atom without categories', async () => {
    mockMutate.mockResolvedValue({ data: { change: ['u1'] } })
    mockQuery.mockResolvedValue(emptyRetrieve)
    const { result } = renderHook(() => useGraphData())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await act(() => result.current.updateAtom('u1', baseAtom as any))

    const updateCall = mockMutate.mock.calls.find(
      ([args]) => args.mutation === UPDATE_ATOM_MUTATION,
    )
    // Omitted (not null/[]): replace-all semantics mean a present field would wipe assignments.
    expect(updateCall?.[0].variables.inputs[0]).not.toHaveProperty('categories')
  })

  it('RETRIEVE_QUERY selects the category assignments so atoms round-trip them', () => {
    const printed = RETRIEVE_QUERY.loc?.source.body ?? ''
    expect(printed).toContain('categories')
    expect(printed).toContain('dimensionKey')
    expect(printed).toContain('valueKey')
  })
})

describe('useGraphData access-error handling (BI-260061 / REQ-FR-260069)', () => {
  const atom = {
    labels: ['P'],
    bonds: [],
    properties: {
      shellies: { uuid: 'u1' },
      nuclearies: { title: 'A', description: '', content: '', operation: null, constants: null },
    },
  }

  it('maps AU-UNAUTHORIZED on retrieve to a clear access message', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useGraphData())
    await act(() => result.current.search(['P']))
    expect(result.current.error).toMatch(/don't have access/i)
  })

  it('stays silent on session expiry during retrieve (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useGraphData())
    await act(() => result.current.search(['P']))
    expect(result.current.error).toBeNull()
  })

  it('shows the raw message for an unknown retrieve failure', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    const { result } = renderHook(() => useGraphData())
    await act(() => result.current.search(['P']))
    expect(result.current.error).toBe('kaboom')
  })

  it('falls back to a generic message when a retrieve failure carries no message', async () => {
    mockQuery.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useGraphData())
    await act(() => result.current.search(['P']))
    expect(result.current.error).toBe('Failed to load graph data')
  })

  it('surfaces a mapped access error when an edit is rejected, and rethrows', async () => {
    mockMutate.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useGraphData())
    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(result.current.updateAtom('u1', atom as any)).rejects.toThrow()
    })
    expect(result.current.error).toMatch(/don't have access/i)
  })

  it('stays silent on session expiry during an edit', async () => {
    mockMutate.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useGraphData())
    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(result.current.updateAtom('u1', atom as any)).rejects.toThrow()
    })
    expect(result.current.error).toBeNull()
  })

  it('stays silent on an unknown edit failure but still rethrows', async () => {
    mockMutate.mockRejectedValue(new Error('whoops'))
    const { result } = renderHook(() => useGraphData())
    await act(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(result.current.updateAtom('u1', atom as any)).rejects.toThrow()
    })
    expect(result.current.error).toBeNull()
  })

  it('surfaces a mapped access error when a delete is rejected', async () => {
    mockMutate.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useGraphData())
    await act(async () => {
      await expect(result.current.deleteAtom('u1')).rejects.toThrow()
    })
    expect(result.current.error).toMatch(/don't have access/i)
  })
})
