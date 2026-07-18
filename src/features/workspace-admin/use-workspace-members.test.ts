import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaceMembers } from './use-workspace-members'
import {
  LIST_WORKSPACE_MEMBERS_QUERY,
  ADD_WORKSPACE_MEMBER_MUTATION,
  REMOVE_WORKSPACE_MEMBER_MUTATION,
  UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
} from '../../api-contract/workspace-operations'

const mockQuery = vi.fn()
const mockMutate = vi.fn()
// One stable client object — a fresh object per render would retrigger the load effect.
const mockClient = { query: mockQuery, mutate: mockMutate }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const ADMIN = { userUuid: 'u-1', username: 'demo.user', email: 'demo@crystord.test', role: 'ADMIN', joinedAt: '2026-07-01T00:00:00Z' }
const VIEWER = { userUuid: 'u-2', username: 'ada', email: 'ada@crystord.test', role: 'VIEWER', joinedAt: '2026-07-02T00:00:00Z' }

beforeEach(() => {
  mockQuery.mockReset()
  mockMutate.mockReset()
  mockQuery.mockResolvedValue({ data: { listWorkspaceMembers: [ADMIN, VIEWER] } })
  mockMutate.mockResolvedValue({ data: {} })
})

async function renderMembers(uuid = 'ws-1', onMembershipChanged?: () => void) {
  const rendered = renderHook(
    ({ workspaceUuid }: { workspaceUuid: string }) => useWorkspaceMembers(workspaceUuid, onMembershipChanged),
    { initialProps: { workspaceUuid: uuid } },
  )
  await waitFor(() => expect(rendered.result.current.loading).toBe(false))
  return rendered
}

describe('useWorkspaceMembers list load', () => {
  it('loads the member list network-only for the given workspace', async () => {
    const { result } = await renderMembers()
    expect(result.current.members).toEqual([ADMIN, VIEWER])
    expect(mockQuery).toHaveBeenCalledWith({
      query: LIST_WORKSPACE_MEMBERS_QUERY,
      variables: { workspaceUuid: 'ws-1' },
      fetchPolicy: 'network-only',
    })
  })

  it('treats a missing data payload as an empty member list', async () => {
    mockQuery.mockResolvedValue({ data: undefined })
    const { result } = await renderMembers()
    expect(result.current.members).toEqual([])
  })

  it('re-loads (and empties the stale list) when the workspace changes', async () => {
    const { result, rerender } = await renderMembers()
    mockQuery.mockResolvedValue({ data: { listWorkspaceMembers: [VIEWER] } })

    rerender({ workspaceUuid: 'ws-2' })
    // The previous workspace's members must never show for the new selection.
    expect(result.current.members).toEqual([])
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.members).toEqual([VIEWER])
    expect(mockQuery).toHaveBeenLastCalledWith(expect.objectContaining({ variables: { workspaceUuid: 'ws-2' } }))
  })

  it('surfaces a generic message for an unknown load failure', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    const { result } = await renderMembers()
    expect(result.current.loadError).toBe('Could not load the member list.')
  })

  it('maps a recognized access code to its user-facing message', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = await renderMembers()
    expect(result.current.loadError).toMatch(/don't have access/i)
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const rendered = renderHook(() => useWorkspaceMembers('ws-1'))
    await waitFor(() => expect(mockQuery).toHaveBeenCalled())
    expect(rendered.result.current.loadError).toBeNull()
  })

  it('stringifies non-Error load failures into the generic message', async () => {
    mockQuery.mockRejectedValue('plain failure')
    const { result } = await renderMembers()
    expect(result.current.loadError).toBe('Could not load the member list.')
  })
})

describe('useWorkspaceMembers mutations', () => {
  it('addMember sends username+role, re-fetches, and notifies the caller', async () => {
    const onMembershipChanged = vi.fn()
    const { result } = await renderMembers('ws-1', onMembershipChanged)
    mockQuery.mockClear()

    let ok = false
    await act(async () => { ok = await result.current.addMember('ada', 'EDITOR') })

    expect(ok).toBe(true)
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: ADD_WORKSPACE_MEMBER_MUTATION,
      variables: { workspaceUuid: 'ws-1', username: 'ada', role: 'EDITOR' },
    })
    expect(mockQuery).toHaveBeenCalled()
    expect(onMembershipChanged).toHaveBeenCalledOnce()
  })

  it('treats a missing data payload on the post-mutation re-fetch as an empty list', async () => {
    const { result } = await renderMembers()
    mockQuery.mockResolvedValue({ data: undefined })
    await act(async () => { await result.current.addMember('ada', 'VIEWER') })
    expect(result.current.members).toEqual([])
  })

  it('addMember works without a membership-change callback', async () => {
    const { result } = await renderMembers()
    let ok = false
    await act(async () => { ok = await result.current.addMember('ada', 'VIEWER') })
    expect(ok).toBe(true)
  })

  it('removeMember fires the remove mutation, re-fetches, and notifies the caller', async () => {
    const onMembershipChanged = vi.fn()
    const { result } = await renderMembers('ws-1', onMembershipChanged)
    await act(async () => { await result.current.removeMember('ada') })
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: REMOVE_WORKSPACE_MEMBER_MUTATION,
      variables: { workspaceUuid: 'ws-1', username: 'ada' },
    })
    expect(onMembershipChanged).toHaveBeenCalledOnce()
  })

  it('updateRole fires the role mutation and re-fetches', async () => {
    const { result } = await renderMembers()
    mockQuery.mockClear()
    await act(async () => { await result.current.updateRole('ada', 'ADMIN') })
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
      variables: { workspaceUuid: 'ws-1', username: 'ada', role: 'ADMIN' },
    })
    expect(mockQuery).toHaveBeenCalled()
  })

  it('maps the unknown-principal code to its user-facing message (CR-16)', async () => {
    mockMutate.mockRejectedValue(new Error('CR-16-PRINCIPAL-UNKNOWN'))
    const { result } = await renderMembers()
    let ok = true
    await act(async () => { ok = await result.current.addMember('ghost', 'VIEWER') })
    expect(ok).toBe(false)
    expect(result.current.mutationError).toMatch(/no matching user or workspace/i)
  })

  it('surfaces unrecognized mutation errors verbatim (raw fallback)', async () => {
    mockMutate.mockRejectedValue(new Error('WS-LAST-ADMIN'))
    const { result } = await renderMembers()
    await act(async () => { await result.current.removeMember('demo.user') })
    expect(result.current.mutationError).toBe('WS-LAST-ADMIN')
  })

  it('stringifies non-Error mutation failures', async () => {
    mockMutate.mockRejectedValue('plain failure')
    const { result } = await renderMembers()
    await act(async () => { await result.current.updateRole('ada', 'VIEWER') })
    expect(result.current.mutationError).toBe('plain failure')
  })

  it('stays silent on session expiry during a mutation', async () => {
    mockMutate.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = await renderMembers()
    let ok = true
    await act(async () => { ok = await result.current.addMember('ada', 'VIEWER') })
    expect(ok).toBe(false)
    expect(result.current.mutationError).toBeNull()
  })

  it('pending resets after a mutation settles', async () => {
    const { result } = await renderMembers()
    await act(async () => { await result.current.updateRole('ada', 'EDITOR') })
    expect(result.current.pending).toBe(false)
  })
})
