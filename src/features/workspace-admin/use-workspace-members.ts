import { useState, useEffect, useCallback } from 'react'
import { useApolloClient } from '@apollo/client/react'
import {
  LIST_WORKSPACE_MEMBERS_QUERY,
  ADD_WORKSPACE_MEMBER_MUTATION,
  REMOVE_WORKSPACE_MEMBER_MUTATION,
  UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
} from '../../api-contract/workspace-operations'
import type { ListWorkspaceMembersResponse, WorkspaceMember, WorkspaceRole } from '../../api-contract/workspace-operations'
import { mapAuthError } from '../../api-contract/error-codes'

const LOAD_ERROR = 'Could not load the member list.'

export interface WorkspaceMembersState {
  members: WorkspaceMember[]
  /** True until the member list for the CURRENT workspace has loaded. */
  loading: boolean
  loadError: string | null
  /** Add/remove/role failure text; unrecognized codes surface verbatim (ADR-260066). */
  mutationError: string | null
  /** True while a member mutation is in flight (disables the row affordances). */
  pending: boolean
  addMember: (username: string, role: WorkspaceRole) => Promise<boolean>
  removeMember: (username: string) => Promise<boolean>
  updateRole: (username: string, role: WorkspaceRole) => Promise<boolean>
}

/**
 * Member list + membership mutations for one selected workspace (ADR-260066 / REQ-FR-260074).
 * The list re-loads whenever `workspaceUuid` changes and after every successful mutation;
 * `onMembershipChanged` fires after add/remove so the caller can refresh workspace memberCounts.
 * The caller's own role is derived from this list (the schema exposes no caller-role field).
 */
export function useWorkspaceMembers(workspaceUuid: string, onMembershipChanged?: () => void): WorkspaceMembersState {
  const client = useApolloClient()
  // Loaded members are keyed by workspace so a selection switch never shows the previous
  // workspace's members (and `loading` derives from the key, not a synchronous effect setState).
  const [loaded, setLoaded] = useState<{ uuid: string; members: WorkspaceMember[] } | null>(null)
  const [pending, setPending] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const fetchMembers = useCallback(async (uuid: string) => {
    const { data } = await client.query<ListWorkspaceMembersResponse>({
      query: LIST_WORKSPACE_MEMBERS_QUERY,
      variables: { workspaceUuid: uuid },
      fetchPolicy: 'network-only',
    })
    setLoaded({ uuid, members: data?.listWorkspaceMembers ?? [] })
    setLoadError(null)
  }, [client])

  useEffect(() => {
    // Load is inlined (not fetchMembers) so setState stays inside the async callbacks the
    // react-hooks/set-state-in-effect rule accepts (the useCategoryBrowse pattern).
    void client
      .query<ListWorkspaceMembersResponse>({
        query: LIST_WORKSPACE_MEMBERS_QUERY,
        variables: { workspaceUuid },
        fetchPolicy: 'network-only',
      })
      .then(({ data }) => {
        setLoaded({ uuid: workspaceUuid, members: data?.listWorkspaceMembers ?? [] })
        setLoadError(null)
      })
      .catch((err: unknown) => {
        const outcome = mapAuthError(err instanceof Error ? err.message : String(err))
        // Session expiry signs out globally — don't flash a raw error here (useGraphData's rule).
        if (outcome.kind === 'reauth') return
        setLoadError(outcome.code ? outcome.message : LOAD_ERROR)
      })
  }, [client, workspaceUuid])

  const runMutation = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setMutationError(null)
    setPending((n) => n + 1)
    try {
      await action()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const outcome = mapAuthError(msg)
      if (outcome.kind !== 'reauth') setMutationError(outcome.code ? outcome.message : msg)
      return false
    } finally {
      setPending((n) => n - 1)
    }
  }, [])

  const addMember = useCallback((username: string, role: WorkspaceRole) =>
    runMutation(async () => {
      await client.mutate({
        mutation: ADD_WORKSPACE_MEMBER_MUTATION,
        variables: { workspaceUuid, username, role },
      })
      await fetchMembers(workspaceUuid)
      onMembershipChanged?.()
    }), [client, runMutation, fetchMembers, workspaceUuid, onMembershipChanged])

  const removeMember = useCallback((username: string) =>
    runMutation(async () => {
      await client.mutate({
        mutation: REMOVE_WORKSPACE_MEMBER_MUTATION,
        variables: { workspaceUuid, username },
      })
      await fetchMembers(workspaceUuid)
      onMembershipChanged?.()
    }), [client, runMutation, fetchMembers, workspaceUuid, onMembershipChanged])

  const updateRole = useCallback((username: string, role: WorkspaceRole) =>
    runMutation(async () => {
      await client.mutate({
        mutation: UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
        variables: { workspaceUuid, username, role },
      })
      await fetchMembers(workspaceUuid)
    }), [client, runMutation, fetchMembers, workspaceUuid])

  const currentLoaded = loaded?.uuid === workspaceUuid ? loaded.members : null

  return {
    members: currentLoaded ?? [],
    loading: currentLoaded === null && loadError === null,
    loadError,
    mutationError,
    pending: pending > 0,
    addMember,
    removeMember,
    updateRole,
  }
}
