import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useShareActions } from './use-share-actions'
import {
  SHARE_ATOM_MUTATION,
  REVOKE_ATOM_ACCESS_MUTATION,
} from '../../api-contract/sharing-operations'

const mockMutate = vi.fn()
const mockClient = { mutate: mockMutate }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const refetchGrants = vi.fn<() => Promise<void>>()

beforeEach(() => {
  mockMutate.mockReset()
  refetchGrants.mockReset()
  refetchGrants.mockResolvedValue(undefined)
})

describe('useShareActions — share', () => {
  it('sends the share mutation with principal/type/level, refetches, and reports success', async () => {
    mockMutate.mockResolvedValue({ data: { shareAtom: true } })
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let ok!: boolean
    await act(async () => { ok = await result.current.share('bob', 'USER', 'EDITOR') })

    expect(ok).toBe(true)
    expect(mockMutate).toHaveBeenCalledOnce()
    expect(mockMutate.mock.calls[0]![0]).toEqual({
      mutation: SHARE_ATOM_MUTATION,
      variables: { atomUuid: 'atom-1', principal: 'bob', principalType: 'USER', level: 'EDITOR' },
    })
    expect(refetchGrants).toHaveBeenCalledOnce()
    expect(result.current.feedback).toEqual({ kind: 'success', message: 'Shared with bob.' })
  })

  it('is pending while the mutation is in flight, and not after', async () => {
    let resolve!: (v: unknown) => void
    mockMutate.mockReturnValue(new Promise((res) => { resolve = res }))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let done!: Promise<boolean>
    act(() => { done = result.current.share('bob', 'USER', 'VIEWER') })
    expect(result.current.pending).toBe(true)

    await act(async () => resolve({ data: { shareAtom: true } }))
    await act(() => done.then(() => undefined))
    expect(result.current.pending).toBe(false)
  })

  it('a server false means no grant: error feedback, no refetch', async () => {
    mockMutate.mockResolvedValue({ data: { shareAtom: false } })
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let ok!: boolean
    await act(async () => { ok = await result.current.share('bob', 'USER', 'VIEWER') })

    expect(ok).toBe(false)
    expect(refetchGrants).not.toHaveBeenCalled()
    expect(result.current.feedback).toEqual({ kind: 'error', message: 'Could not share the atom.' })
  })

  it('surfaces the mapped CR-16 message for an unknown principal', async () => {
    mockMutate.mockRejectedValue(new Error('CR-16-PRINCIPAL-UNKNOWN'))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    await act(async () => { await result.current.share('typo', 'USER', 'VIEWER') })

    expect(result.current.feedback).toEqual({
      kind: 'error',
      message: 'No matching user or workspace was found.',
    })
  })

  it('surfaces an unrecognized failure verbatim and stringifies a non-Error one', async () => {
    mockMutate.mockRejectedValueOnce(new Error('SHARE-EXPLODED'))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))
    await act(async () => { await result.current.share('bob', 'USER', 'VIEWER') })
    expect(result.current.feedback).toEqual({ kind: 'error', message: 'SHARE-EXPLODED' })

    mockMutate.mockRejectedValueOnce('string failure')
    await act(async () => { await result.current.share('bob', 'USER', 'VIEWER') })
    expect(result.current.feedback).toEqual({ kind: 'error', message: 'string failure' })
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockMutate.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let ok!: boolean
    await act(async () => { ok = await result.current.share('bob', 'USER', 'VIEWER') })

    expect(ok).toBe(false)
    expect(result.current.feedback).toBeNull()
  })

  it('a new action clears the previous feedback while in flight', async () => {
    mockMutate.mockRejectedValueOnce(new Error('SHARE-EXPLODED'))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))
    await act(async () => { await result.current.share('bob', 'USER', 'VIEWER') })
    expect(result.current.feedback).not.toBeNull()

    let resolve!: (v: unknown) => void
    mockMutate.mockReturnValue(new Promise((res) => { resolve = res }))
    let done!: Promise<boolean>
    act(() => { done = result.current.share('bob', 'USER', 'VIEWER') })
    expect(result.current.feedback).toBeNull()

    await act(async () => resolve({ data: { shareAtom: true } }))
    await act(() => done.then(() => undefined))
  })
})

describe('useShareActions — revoke', () => {
  it('sends the revoke mutation with principal/type, refetches, and reports success', async () => {
    mockMutate.mockResolvedValue({ data: { revokeAtomAccess: true } })
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let ok!: boolean
    await act(async () => { ok = await result.current.revoke('team-a', 'WORKSPACE') })

    expect(ok).toBe(true)
    expect(mockMutate.mock.calls[0]![0]).toEqual({
      mutation: REVOKE_ATOM_ACCESS_MUTATION,
      variables: { atomUuid: 'atom-1', principal: 'team-a', principalType: 'WORKSPACE' },
    })
    expect(refetchGrants).toHaveBeenCalledOnce()
    expect(result.current.feedback).toEqual({ kind: 'success', message: 'Revoked access for team-a.' })
  })

  it('a server false means nothing revoked: error feedback, no refetch', async () => {
    mockMutate.mockResolvedValue({ data: { revokeAtomAccess: false } })
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let ok!: boolean
    await act(async () => { ok = await result.current.revoke('bob', 'USER') })

    expect(ok).toBe(false)
    expect(refetchGrants).not.toHaveBeenCalled()
    expect(result.current.feedback).toEqual({ kind: 'error', message: 'Could not revoke that access.' })
  })

  it('surfaces a revoke failure through the central mapper', async () => {
    mockMutate.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    await act(async () => { await result.current.revoke('bob', 'USER') })

    await waitFor(() => expect(result.current.feedback?.message).toMatch(/don't have access/i))
    expect(result.current.feedback?.kind).toBe('error')
  })

  it('a refetch failure after a successful mutation surfaces as an error, not a success', async () => {
    mockMutate.mockResolvedValue({ data: { revokeAtomAccess: true } })
    refetchGrants.mockRejectedValue(new Error('GRANTS-EXPLODED'))
    const { result } = renderHook(() => useShareActions('atom-1', refetchGrants))

    let ok!: boolean
    await act(async () => { ok = await result.current.revoke('bob', 'USER') })

    expect(ok).toBe(false)
    expect(result.current.feedback).toEqual({ kind: 'error', message: 'GRANTS-EXPLODED' })
  })
})
