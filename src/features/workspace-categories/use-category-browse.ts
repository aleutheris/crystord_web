import { useState, useEffect, useCallback, useRef } from 'react'
import { useApolloClient } from '@apollo/client/react'
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
import type {
  CategoryBrowseChild,
  CategoryDimension,
  RetrieveCategoryBrowseResponse,
  RetrieveCategoryDimensionsResponse,
} from '../../api-contract/category-operations'
import { mapAuthError } from '../../api-contract/error-codes'
import type { BrowseNodeRef } from './category-tree'

const LOAD_ERROR = 'Could not load categories.'

export interface CategoryBrowse {
  dimensions: CategoryDimension[]
  /** Browse cache: node key (dimension or value) → its children with atom counts. */
  childrenByNode: ReadonlyMap<string, CategoryBrowseChild[]>
  loading: boolean
  loadError: string | null
  /** Authoring failure text; unrecognized codes (CAT-*) surface verbatim (ADR-260064). */
  mutationError: string | null
  loadChildren: (node: BrowseNodeRef) => void
  createDimension: (key: string, displayName: string) => Promise<boolean>
  createValue: (key: string, displayName: string, dimensionKey: string, parentNode: BrowseNodeRef) => Promise<boolean>
  renameNode: (node: BrowseNodeRef, displayName: string, parentNode: BrowseNodeRef | null) => Promise<boolean>
  removeNode: (node: BrowseNodeRef, parentNode: BrowseNodeRef | null) => Promise<boolean>
}

/**
 * Lazy category browse + inline authoring for the Categories navigator (ADR-260064 /
 * EPIC-260068). Dimensions load once on mount (network-only); children load lazily per node
 * on expand into a cache keyed by node key. Authoring helpers run a CRUD mutation and then
 * refresh only the affected slice (the dimension list or the parent node's children).
 */
export function useCategoryBrowse(): CategoryBrowse {
  const client = useApolloClient()
  const [dimensions, setDimensions] = useState<CategoryDimension[]>([])
  const [childrenByNode, setChildrenByNode] = useState<ReadonlyMap<string, CategoryBrowseChild[]>>(new Map())
  // Starts at 1: the mount dimensions load below is counted here so the effect body stays free
  // of synchronous setState (per react-hooks/set-state-in-effect — the useTaxonomy pattern).
  const [pending, setPending] = useState(1)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  // Nodes whose children are loaded or in flight — dedupes repeat loadChildren calls.
  const requestedRef = useRef(new Set<string>())

  const surfaceLoadError = useCallback((err: unknown) => {
    const outcome = mapAuthError(err instanceof Error ? err.message : String(err))
    // Session expiry signs out globally — don't flash a raw error here (useGraphData's rule).
    if (outcome.kind === 'reauth') return
    setLoadError(outcome.code ? outcome.message : LOAD_ERROR)
  }, [])

  const refreshDimensions = useCallback(() =>
    client
      .query<RetrieveCategoryDimensionsResponse>({
        query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
        fetchPolicy: 'network-only',
      })
      .then(({ data }) => {
        setDimensions(data?.retrieveCategoryDimensions ?? [])
      }), [client])

  useEffect(() => {
    // Mount load is inlined (not refreshDimensions) so setState stays inside the async
    // callbacks the react-hooks/set-state-in-effect rule accepts.
    void client
      .query<RetrieveCategoryDimensionsResponse>({
        query: RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
        fetchPolicy: 'network-only',
      })
      .then(({ data }) => {
        setDimensions(data?.retrieveCategoryDimensions ?? [])
      })
      .catch(surfaceLoadError)
      .finally(() => setPending((n) => n - 1))
  }, [client, surfaceLoadError])

  const fetchChildren = useCallback(async (node: BrowseNodeRef) => {
    const { data } = await client.query<RetrieveCategoryBrowseResponse>({
      query: RETRIEVE_CATEGORY_BROWSE_QUERY,
      // Exactly one of valueKey/dimensionKey selects the node (schema 9.2.0 contract).
      variables: node.kind === 'dimension' ? { dimensionKey: node.key } : { valueKey: node.key },
      fetchPolicy: 'network-only',
    })
    const children = data?.retrieveCategoryBrowse.children ?? []
    setChildrenByNode((prev) => new Map(prev).set(node.key, children))
  }, [client])

  const loadChildren = useCallback((node: BrowseNodeRef) => {
    if (requestedRef.current.has(node.key)) return
    requestedRef.current.add(node.key)
    setPending((n) => n + 1)
    void fetchChildren(node)
      .catch((err: unknown) => {
        requestedRef.current.delete(node.key) // allow a retry after a failure
        surfaceLoadError(err)
      })
      .finally(() => setPending((n) => n - 1))
  }, [fetchChildren, surfaceLoadError])

  /** Refresh a node's children after authoring (marks it requested so lazy dedupe holds). */
  const refreshChildren = useCallback(async (node: BrowseNodeRef) => {
    requestedRef.current.add(node.key)
    await fetchChildren(node)
  }, [fetchChildren])

  const runMutation = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    setMutationError(null)
    setPending((n) => n + 1)
    try {
      await action()
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const outcome = mapAuthError(msg)
      // Taxonomy codes (CAT-*) aren't in the auth table — surface the raw message verbatim
      // (it carries the code, ADR-260064); reauth stays silent (global sign-out).
      if (outcome.kind !== 'reauth') setMutationError(outcome.code ? outcome.message : msg)
      return false
    } finally {
      setPending((n) => n - 1)
    }
  }, [])

  const createDimension = useCallback((key: string, displayName: string) =>
    runMutation(async () => {
      await client.mutate({ mutation: CREATE_CATEGORY_DIMENSION_MUTATION, variables: { key, displayName } })
      await refreshDimensions()
    }), [client, runMutation, refreshDimensions])

  const createValue = useCallback((key: string, displayName: string, dimensionKey: string, parentNode: BrowseNodeRef) =>
    runMutation(async () => {
      await client.mutate({
        mutation: CREATE_CATEGORY_VALUE_MUTATION,
        variables: {
          key,
          displayName,
          dimensionKey,
          // A value parent nests the new value under it; a dimension parent makes it a root.
          ...(parentNode.kind === 'value' ? { parentValueKeys: [parentNode.key] } : {}),
        },
      })
      await refreshChildren(parentNode)
    }), [client, runMutation, refreshChildren])

  const renameNode = useCallback((node: BrowseNodeRef, displayName: string, parentNode: BrowseNodeRef | null) =>
    runMutation(async () => {
      await client.mutate({
        mutation: node.kind === 'dimension' ? UPDATE_CATEGORY_DIMENSION_MUTATION : UPDATE_CATEGORY_VALUE_MUTATION,
        variables: { key: node.key, displayName },
      })
      if (node.kind === 'dimension') await refreshDimensions()
      else if (parentNode) await refreshChildren(parentNode)
    }), [client, runMutation, refreshDimensions, refreshChildren])

  const removeNode = useCallback((node: BrowseNodeRef, parentNode: BrowseNodeRef | null) =>
    runMutation(async () => {
      await client.mutate({
        mutation: node.kind === 'dimension' ? DELETE_CATEGORY_DIMENSION_MUTATION : DELETE_CATEGORY_VALUE_MUTATION,
        variables: { key: node.key },
      })
      // Drop the removed node's own (now stale) children cache before refreshing its parent.
      requestedRef.current.delete(node.key)
      setChildrenByNode((prev) => {
        const next = new Map(prev)
        next.delete(node.key)
        return next
      })
      if (node.kind === 'dimension') await refreshDimensions()
      else if (parentNode) await refreshChildren(parentNode)
    }), [client, runMutation, refreshDimensions, refreshChildren])

  return {
    dimensions,
    childrenByNode,
    loading: pending > 0,
    loadError,
    mutationError,
    loadChildren,
    createDimension,
    createValue,
    renameNode,
    removeNode,
  }
}
