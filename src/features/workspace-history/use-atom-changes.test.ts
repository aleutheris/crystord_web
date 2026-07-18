import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAtomChanges, PAGE_SIZE } from './use-atom-changes'
import type { ChangeEvent } from '../../api-contract/history-operations'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

function makeEvent(n: number): ChangeEvent {
  return {
    timestamp: `2026-07-${String(n + 1).padStart(2, '0')}T10:00:00Z`,
    eventType: 'UPDATE',
    userId: `user-${n}`,
    remark: null,
    propertyChanges: [],
  }
}

const EVENTS = Array.from({ length: PAGE_SIZE }, (_, n) => makeEvent(n))

function respondWith(events: ChangeEvent[] | null) {
  return { data: { retrieve: [{ properties: { shellies: { uuid: 'atom-1', changes: events } } }] } }
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe('useAtomChanges — mount load', () => {
  it('fetches page 0 network-only with the atom uuid and PAGE_SIZE', async () => {
    mockQuery.mockResolvedValue(respondWith(EVENTS))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.events).toEqual(EVENTS))
    expect(mockQuery).toHaveBeenCalledOnce()
    expect(mockQuery.mock.calls[0]![0].variables).toEqual({ uuid: 'atom-1', limit: PAGE_SIZE, offset: 0 })
    expect(mockQuery.mock.calls[0]![0].fetchPolicy).toBe('network-only')
    expect(result.current.error).toBeNull()
  })

  it('is loading while the page is in flight, and not after', async () => {
    let resolve!: (v: unknown) => void
    mockQuery.mockReturnValue(new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    expect(result.current.loading).toBe(true)
    await act(async () => resolve(respondWith(EVENTS)))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('a full page leaves endReached false', async () => {
    mockQuery.mockResolvedValue(respondWith(EVENTS))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.endReached).toBe(false)
  })

  it('a short page sets endReached', async () => {
    mockQuery.mockResolvedValue(respondWith([makeEvent(0)]))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toHaveLength(1)
    expect(result.current.endReached).toBe(true)
  })

  it('treats a null changes list as no recorded changes (ADR-260068)', async () => {
    mockQuery.mockResolvedValue(respondWith(null))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toEqual([])
    expect(result.current.endReached).toBe(true)
  })

  it('tolerates an empty retrieve list (unknown uuid)', async () => {
    mockQuery.mockResolvedValue({ data: { retrieve: [] } })
    const { result } = renderHook(() => useAtomChanges('gone'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toEqual([])
    expect(result.current.endReached).toBe(true)
  })

  it('tolerates a data-less response', async () => {
    mockQuery.mockResolvedValue({ data: undefined })
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toEqual([])
  })
})

describe('useAtomChanges — loadMore', () => {
  it('appends the next offset and hits the end on a short page', async () => {
    const secondPage = [makeEvent(10), makeEvent(11)]
    mockQuery.mockImplementation(({ variables }: { variables: { offset: number } }) =>
      Promise.resolve(respondWith(variables.offset === 0 ? EVENTS : secondPage)))
    const { result } = renderHook(() => useAtomChanges('atom-1'))
    await waitFor(() => expect(result.current.events).toHaveLength(PAGE_SIZE))

    act(() => result.current.loadMore())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.events).toHaveLength(PAGE_SIZE + 2))
    expect(mockQuery.mock.calls[1]![0].variables).toEqual({ uuid: 'atom-1', limit: PAGE_SIZE, offset: PAGE_SIZE })
    // Server order preserved: the second page rides behind the first.
    expect(result.current.events.slice(PAGE_SIZE)).toEqual(secondPage)
    expect(result.current.endReached).toBe(true)
  })

  it('an exact-boundary empty page also ends the history', async () => {
    mockQuery.mockImplementation(({ variables }: { variables: { offset: number } }) =>
      Promise.resolve(respondWith(variables.offset === 0 ? EVENTS : [])))
    const { result } = renderHook(() => useAtomChanges('atom-1'))
    await waitFor(() => expect(result.current.events).toHaveLength(PAGE_SIZE))

    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.endReached).toBe(true))
    expect(result.current.events).toHaveLength(PAGE_SIZE)
  })
})

describe('useAtomChanges — refresh', () => {
  it('replaces the list from offset 0 and re-probes the end', async () => {
    let calls = 0
    mockQuery.mockImplementation(() => {
      calls++
      return Promise.resolve(respondWith(calls === 1 ? [makeEvent(0)] : EVENTS))
    })
    const { result } = renderHook(() => useAtomChanges('atom-1'))
    await waitFor(() => expect(result.current.endReached).toBe(true))

    act(() => result.current.refresh())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.events).toHaveLength(PAGE_SIZE))
    expect(mockQuery.mock.calls[1]![0].variables).toEqual({ uuid: 'atom-1', limit: PAGE_SIZE, offset: 0 })
    // A fresh full page reopens pagination.
    expect(result.current.endReached).toBe(false)
  })

  it('ignores a stale in-flight page resolved after a refresh (out-of-order guard)', async () => {
    const resolvers: ((v: unknown) => void)[] = []
    mockQuery.mockImplementation(() => new Promise((res) => { resolvers.push(res) }))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    act(() => result.current.refresh())
    expect(resolvers).toHaveLength(2)

    // The newer (refresh) response lands first…
    await act(async () => resolvers[1]!(respondWith([makeEvent(1)])))
    await waitFor(() => expect(result.current.events).toEqual([makeEvent(1)]))

    // …then the stale mount response resolves and must be dropped.
    await act(async () => resolvers[0]!(respondWith(EVENTS)))
    expect(result.current.events).toEqual([makeEvent(1)])
  })

  it('drops a stale failure resolved after a refresh', async () => {
    let reject!: (e: unknown) => void
    let resolve!: (v: unknown) => void
    mockQuery
      .mockImplementationOnce(() => new Promise((_res, rej) => { reject = rej }))
      .mockImplementationOnce(() => new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    act(() => result.current.refresh())
    await act(async () => resolve(respondWith([makeEvent(1)])))
    await act(async () => reject(new Error('stale failure')))

    expect(result.current.error).toBeNull()
    expect(result.current.events).toEqual([makeEvent(1)])
  })
})

describe('useAtomChanges — error surfacing', () => {
  it('surfaces the mapped message for a known access-error code', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.error).toMatch(/don't have access/i))
  })

  it('surfaces an unrecognized message verbatim (the use-category-browse precedent)', async () => {
    mockQuery.mockRejectedValue(new Error('HISTORY-EXPLODED'))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.error).toBe('HISTORY-EXPLODED'))
  })

  it('falls back to the generic message when the failure carries no text', async () => {
    mockQuery.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.error).toBe('Could not load the change history.'))
  })

  it('stringifies a non-Error rejection', async () => {
    mockQuery.mockRejectedValue('string failure')
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.error).toBe('string failure'))
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useAtomChanges('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
  })

  it('a successful refresh clears a previous error', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('HISTORY-EXPLODED'))
      .mockResolvedValueOnce(respondWith([makeEvent(0)]))
    const { result } = renderHook(() => useAtomChanges('atom-1'))
    await waitFor(() => expect(result.current.error).toBe('HISTORY-EXPLODED'))

    act(() => result.current.refresh())

    await waitFor(() => expect(result.current.error).toBeNull())
    expect(result.current.events).toEqual([makeEvent(0)])
  })
})
