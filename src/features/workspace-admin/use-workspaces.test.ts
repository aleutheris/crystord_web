import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaces } from './use-workspaces'
import {
  LIST_MY_WORKSPACES_QUERY,
  CREATE_WORKSPACE_MUTATION,
  UPDATE_WORKSPACE_MUTATION,
  DISSOLVE_WORKSPACE_MUTATION,
} from '../../api-contract/workspace-operations'

const mockQuery = vi.fn()
const mockMutate = vi.fn()
// One stable client object — a fresh object per render would retrigger the mount effect.
const mockClient = { query: mockQuery, mutate: mockMutate }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const WORKSPACE = {
  uuid: 'ws-1', key: 'team-a', name: 'Team A', description: null,
  createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', memberCount: 2,
}

beforeEach(() => {
  mockQuery.mockReset()
  mockMutate.mockReset()
  mockQuery.mockResolvedValue({ data: { listMyWorkspaces: [WORKSPACE] } })
  mockMutate.mockResolvedValue({ data: {} })
})

async function renderWorkspaces() {
  const rendered = renderHook(() => useWorkspaces())
  await waitFor(() => expect(rendered.result.current.loading).toBe(false))
  return rendered
}

describe('useWorkspaces list load', () => {
  it('loads the workspace list network-only on mount', async () => {
    const { result } = await renderWorkspaces()
    expect(result.current.workspaces).toEqual([WORKSPACE])
    expect(mockQuery).toHaveBeenCalledWith({ query: LIST_MY_WORKSPACES_QUERY, fetchPolicy: 'network-only' })
  })

  it('treats a missing data payload as an empty list', async () => {
    mockQuery.mockResolvedValue({ data: undefined })
    const { result } = await renderWorkspaces()
    expect(result.current.workspaces).toEqual([])
    expect(result.current.loadError).toBeNull()
  })

  it('surfaces a generic message for an unknown load failure', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    const { result } = await renderWorkspaces()
    expect(result.current.loadError).toBe('Could not load your workspaces.')
  })

  it('maps a recognized access code to its user-facing message', async () => {
    mockQuery.mockRejectedValue(new Error('AU-UNAUTHORIZED'))
    const { result } = await renderWorkspaces()
    expect(result.current.loadError).toMatch(/don't have access/i)
  })

  it('stays silent on session expiry (global sign-out handles it)', async () => {
    mockQuery.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = await renderWorkspaces()
    expect(result.current.loadError).toBeNull()
  })

  it('stringifies non-Error load failures into the generic message', async () => {
    mockQuery.mockRejectedValue('plain failure')
    const { result } = await renderWorkspaces()
    expect(result.current.loadError).toBe('Could not load your workspaces.')
  })

  it('refetch re-queries and clears a previous load error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('kaboom'))
    const { result } = await renderWorkspaces()
    expect(result.current.loadError).not.toBeNull()

    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.loadError).toBeNull())
    expect(result.current.workspaces).toEqual([WORKSPACE])
  })

  it('refetch treats a missing data payload as an empty list', async () => {
    const { result } = await renderWorkspaces()
    mockQuery.mockResolvedValue({ data: undefined })
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.workspaces).toEqual([]))
  })

  it('refetch surfaces a load failure', async () => {
    const { result } = await renderWorkspaces()
    mockQuery.mockRejectedValue(new Error('kaboom'))
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.loadError).toBe('Could not load your workspaces.'))
  })
})

describe('useWorkspaces mutations', () => {
  it('createWorkspace sends key/name/description and re-fetches the list', async () => {
    const { result } = await renderWorkspaces()
    mockQuery.mockClear()

    let ok = false
    await act(async () => { ok = await result.current.createWorkspace('team-b', 'Team B', 'Second team') })

    expect(ok).toBe(true)
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_WORKSPACE_MUTATION,
      variables: { key: 'team-b', name: 'Team B', description: 'Second team' },
    })
    expect(mockQuery).toHaveBeenCalledWith({ query: LIST_MY_WORKSPACES_QUERY, fetchPolicy: 'network-only' })
  })

  it('createWorkspace omits an empty description', async () => {
    const { result } = await renderWorkspaces()
    await act(async () => { await result.current.createWorkspace('team-b', 'Team B', '') })
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_WORKSPACE_MUTATION,
      variables: { key: 'team-b', name: 'Team B' },
    })
  })

  it('updateWorkspace patches name/description and re-fetches', async () => {
    const { result } = await renderWorkspaces()
    mockQuery.mockClear()
    await act(async () => { await result.current.updateWorkspace('ws-1', 'Renamed', 'New blurb') })
    expect(mockMutate).toHaveBeenCalledWith({
      mutation: UPDATE_WORKSPACE_MUTATION,
      variables: { uuid: 'ws-1', name: 'Renamed', description: 'New blurb' },
    })
    expect(mockQuery).toHaveBeenCalled()
  })

  it('dissolveWorkspace fires the dissolve mutation and re-fetches', async () => {
    const { result } = await renderWorkspaces()
    mockQuery.mockClear()
    await act(async () => { await result.current.dissolveWorkspace('ws-1') })
    expect(mockMutate).toHaveBeenCalledWith({ mutation: DISSOLVE_WORKSPACE_MUTATION, variables: { uuid: 'ws-1' } })
    expect(mockQuery).toHaveBeenCalled()
  })

  it('maps a recognized mutation error code to its user-facing message', async () => {
    mockMutate.mockRejectedValue(new Error('CR-16-PRINCIPAL-UNKNOWN'))
    const { result } = await renderWorkspaces()
    let ok = true
    await act(async () => { ok = await result.current.dissolveWorkspace('ws-1') })
    expect(ok).toBe(false)
    expect(result.current.mutationError).toMatch(/no matching user or workspace/i)
  })

  it('surfaces unrecognized mutation errors verbatim (raw fallback)', async () => {
    mockMutate.mockRejectedValue(new Error('WS-KEY-ALREADY-EXISTS: key taken'))
    const { result } = await renderWorkspaces()
    await act(async () => { await result.current.createWorkspace('team-a', 'Dup', '') })
    expect(result.current.mutationError).toBe('WS-KEY-ALREADY-EXISTS: key taken')
  })

  it('stringifies non-Error mutation failures', async () => {
    mockMutate.mockRejectedValue('plain failure')
    const { result } = await renderWorkspaces()
    await act(async () => { await result.current.updateWorkspace('ws-1', 'X', '') })
    expect(result.current.mutationError).toBe('plain failure')
  })

  it('stays silent on session expiry during a mutation', async () => {
    mockMutate.mockRejectedValue(new Error('AUTHZ-AUTHENTICATION-REQUIRED'))
    const { result } = await renderWorkspaces()
    let ok = true
    await act(async () => { ok = await result.current.createWorkspace('k', 'N', '') })
    expect(ok).toBe(false)
    expect(result.current.mutationError).toBeNull()
  })

  it('clears the previous mutation error when a new mutation starts', async () => {
    mockMutate.mockRejectedValueOnce(new Error('boom'))
    const { result } = await renderWorkspaces()
    await act(async () => { await result.current.dissolveWorkspace('ws-1') })
    expect(result.current.mutationError).toBe('boom')
    await act(async () => { await result.current.dissolveWorkspace('ws-1') })
    expect(result.current.mutationError).toBeNull()
  })
})
