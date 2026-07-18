import { useState, useEffect, useCallback } from 'react'
import { useApolloClient } from '@apollo/client/react'
import {
  LIST_MY_WORKSPACES_QUERY,
  CREATE_WORKSPACE_MUTATION,
  UPDATE_WORKSPACE_MUTATION,
  DISSOLVE_WORKSPACE_MUTATION,
} from '../../api-contract/workspace-operations'
import type { ListMyWorkspacesResponse, Workspace } from '../../api-contract/workspace-operations'
import { mapAuthError } from '../../api-contract/error-codes'

const LOAD_ERROR = 'Could not load your workspaces.'

export interface WorkspacesState {
  workspaces: Workspace[]
  loading: boolean
  loadError: string | null
  /** Create/rename/dissolve failure text; unrecognized codes surface verbatim (ADR-260066). */
  mutationError: string | null
  refetch: () => void
  createWorkspace: (key: string, name: string, description: string) => Promise<boolean>
  updateWorkspace: (uuid: string, name: string, description: string) => Promise<boolean>
  dissolveWorkspace: (uuid: string) => Promise<boolean>
}

/**
 * The caller's workspace list + workspace-level mutations for the workspace-admin surface
 * (ADR-260066 / REQ-FR-260074). The list loads network-only on mount and re-fetches after every
 * successful mutation; errors go through the central mapper (raw message for unrecognized codes,
 * the use-category-browse precedent). The backend Admin-gates the mutations — the UI only
 * soft-gates affordances.
 */
export function useWorkspaces(): WorkspacesState {
  const client = useApolloClient()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  // Starts at 1: the mount load below is counted here so the effect body stays free of
  // synchronous setState (per react-hooks/set-state-in-effect — the useCategoryBrowse pattern).
  const [pending, setPending] = useState(1)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const surfaceLoadError = useCallback((err: unknown) => {
    const outcome = mapAuthError(err instanceof Error ? err.message : String(err))
    // Session expiry signs out globally — don't flash a raw error here (useGraphData's rule).
    if (outcome.kind === 'reauth') return
    setLoadError(outcome.code ? outcome.message : LOAD_ERROR)
  }, [])

  const fetchWorkspaces = useCallback(() =>
    client
      .query<ListMyWorkspacesResponse>({ query: LIST_MY_WORKSPACES_QUERY, fetchPolicy: 'network-only' })
      .then(({ data }) => {
        setWorkspaces(data?.listMyWorkspaces ?? [])
        setLoadError(null)
      }), [client])

  useEffect(() => {
    // Mount load is inlined (not fetchWorkspaces) so setState stays inside the async
    // callbacks the react-hooks/set-state-in-effect rule accepts.
    void client
      .query<ListMyWorkspacesResponse>({ query: LIST_MY_WORKSPACES_QUERY, fetchPolicy: 'network-only' })
      .then(({ data }) => {
        setWorkspaces(data?.listMyWorkspaces ?? [])
        setLoadError(null)
      })
      .catch(surfaceLoadError)
      .finally(() => setPending((n) => n - 1))
  }, [client, surfaceLoadError])

  const refetch = useCallback(() => {
    setPending((n) => n + 1)
    void fetchWorkspaces()
      .catch(surfaceLoadError)
      .finally(() => setPending((n) => n - 1))
  }, [fetchWorkspaces, surfaceLoadError])

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

  const createWorkspace = useCallback((key: string, name: string, description: string) =>
    runMutation(async () => {
      await client.mutate({
        mutation: CREATE_WORKSPACE_MUTATION,
        variables: { key, name, ...(description ? { description } : {}) },
      })
      await fetchWorkspaces()
    }), [client, runMutation, fetchWorkspaces])

  const updateWorkspace = useCallback((uuid: string, name: string, description: string) =>
    runMutation(async () => {
      await client.mutate({
        mutation: UPDATE_WORKSPACE_MUTATION,
        variables: { uuid, name, description },
      })
      await fetchWorkspaces()
    }), [client, runMutation, fetchWorkspaces])

  const dissolveWorkspace = useCallback((uuid: string) =>
    runMutation(async () => {
      await client.mutate({ mutation: DISSOLVE_WORKSPACE_MUTATION, variables: { uuid } })
      await fetchWorkspaces()
    }), [client, runMutation, fetchWorkspaces])

  return {
    workspaces,
    loading: pending > 0,
    loadError,
    mutationError,
    refetch,
    createWorkspace,
    updateWorkspace,
    dissolveWorkspace,
  }
}
