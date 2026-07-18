import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAtomGrants } from './use-atom-grants'
import type { AtomGrant } from '../../api-contract/sharing-operations'

const mockQuery = vi.fn()
const mockClient = { query: mockQuery }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

function makeGrant(name: string): AtomGrant {
  return {
    principalUuid: `uuid-${name}`,
    principalType: 'USER',
    principalName: name,
    level: 'VIEWER',
    grantedAt: '2026-07-01T10:00:00Z',
    grantedBy: 'owner-1',
  }
}

function respondWith(grants: AtomGrant[]) {
  return { data: { listAtomGrants: grants } }
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe('useAtomGrants — mount load', () => {
  it('fetches the grants network-only with the atom uuid', async () => {
    mockQuery.mockResolvedValue(respondWith([makeGrant('bob')]))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.grants).toEqual([makeGrant('bob')]))
    expect(mockQuery).toHaveBeenCalledOnce()
    expect(mockQuery.mock.calls[0]![0].variables).toEqual({ atomUuid: 'atom-1' })
    expect(mockQuery.mock.calls[0]![0].fetchPolicy).toBe('network-only')
    expect(result.current.error).toBeNull()
  })

  it('is loading while the list is in flight, and not after', async () => {
    let resolve!: (v: unknown) => void
    mockQuery.mockReturnValue(new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    expect(result.current.loading).toBe(true)
    await act(async () => resolve(respondWith([])))
    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('tolerates a data-less response', async () => {
    mockQuery.mockResolvedValue({ data: undefined })
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.grants).toEqual([])
  })
})

describe('useAtomGrants — refetch', () => {
  it('replaces the list from the server (the after-mutation path)', async () => {
    mockQuery
      .mockResolvedValueOnce(respondWith([makeGrant('bob')]))
      .mockResolvedValueOnce(respondWith([makeGrant('bob'), makeGrant('carol')]))
    const { result } = renderHook(() => useAtomGrants('atom-1'))
    await waitFor(() => expect(result.current.grants).toHaveLength(1))

    await act(() => result.current.refetch())

    expect(result.current.grants).toHaveLength(2)
    expect(mockQuery).toHaveBeenCalledTimes(2)
  })

  it('a successful refetch clears a previous error', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('GRANTS-EXPLODED'))
      .mockResolvedValueOnce(respondWith([makeGrant('bob')]))
    const { result } = renderHook(() => useAtomGrants('atom-1'))
    await waitFor(() => expect(result.current.error).toBe('GRANTS-EXPLODED'))

    await act(() => result.current.refetch())

    expect(result.current.error).toBeNull()
    expect(result.current.grants).toEqual([makeGrant('bob')])
  })

  it('ignores a stale in-flight list resolved after a refetch (out-of-order guard)', async () => {
    const resolvers: ((v: unknown) => void)[] = []
    mockQuery.mockImplementation(() => new Promise((res) => { resolvers.push(res) }))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    let refetched!: Promise<void>
    act(() => { refetched = result.current.refetch() })
    expect(resolvers).toHaveLength(2)

    // The newer (refetch) response lands first…
    await act(async () => resolvers[1]!(respondWith([makeGrant('carol')])))
    await act(() => refetched)
    expect(result.current.grants).toEqual([makeGrant('carol')])

    // …then the stale mount response resolves and must be dropped.
    await act(async () => resolvers[0]!(respondWith([makeGrant('bob')])))
    expect(result.current.grants).toEqual([makeGrant('carol')])
  })

  it('drops a stale failure resolved after a refetch', async () => {
    let reject!: (e: unknown) => void
    let resolve!: (v: unknown) => void
    mockQuery
      .mockImplementationOnce(() => new Promise((_res, rej) => { reject = rej }))
      .mockImplementationOnce(() => new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    let refetched!: Promise<void>
    act(() => { refetched = result.current.refetch() })
    await act(async () => resolve(respondWith([makeGrant('bob')])))
    await act(() => refetched)
    await act(async () => reject(new Error('stale failure')))

    expect(result.current.error).toBeNull()
    expect(result.current.grants).toEqual([makeGrant('bob')])
  })

  it('drops a response landing after unmount (mounted guard)', async () => {
    let resolve!: (v: unknown) => void
    mockQuery.mockReturnValue(new Promise((res) => { resolve = res }))
    const { result, unmount } = renderHook(() => useAtomGrants('atom-1'))

    unmount()
    await act(async () => resolve(respondWith([makeGrant('bob')])))

    // No state landed: the pre-unmount snapshot still shows the initial loading state.
    expect(result.current.loading).toBe(true)
    expect(result.current.grants).toEqual([])
  })
})

describe('useAtomGrants — error surfacing', () => {
  it('surfaces the mapped message for a known access-error code', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.error).toMatch(/don't have access/i))
  })

  it('surfaces an unrecognized message verbatim (the use-category-browse precedent)', async () => {
    mockQuery.mockRejectedValue(new Error('GRANTS-EXPLODED'))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.error).toBe('GRANTS-EXPLODED'))
  })

  it('falls back to the generic message when the failure carries no text', async () => {
    mockQuery.mockRejectedValue(new Error(''))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.error).toBe('Could not load the grant list.'))
  })

  it('stringifies a non-Error rejection', async () => {
    mockQuery.mockRejectedValue('string failure')
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.error).toBe('string failure'))
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useAtomGrants('atom-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
  })
})
