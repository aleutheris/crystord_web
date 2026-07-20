import { useState, useCallback, useRef } from 'react'
import { useApolloClient } from '@apollo/client/react'
import {
  RETRIEVE_QUERY,
  CREATE_ATOMS_MUTATION,
  UPDATE_ATOM_MUTATION,
  DESTROY_ATOMS_MUTATION,
} from '../../api-contract/graph-queries'
import type {
  Atom,
  DestroyResponse,
  RetrieveResponse,
} from '../../api-contract/graph-queries'
import type { CategoryFilter } from '../../api-contract/category-operations'
import { mapAuthError } from '../../api-contract/error-codes'

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface AtomCreationOptions {
  description?: string
  content?: string
}

export interface GraphData {
  atoms: Atom[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  /**
   * Either argument may be omitted to keep its last committed value (ADR-260064): pass
   * `undefined` to reuse, `[]` to clear. Existing label-only callers stay valid.
   */
  search: (labels?: string[], categories?: CategoryFilter[]) => Promise<void>
  createAtom: (title: string, labels: string[], options?: AtomCreationOptions) => Promise<string | null>
  updateAtom: (uuid: string, atom: Atom) => Promise<void>
  deleteAtom: (uuid: string) => Promise<void>
  addBond: (sourceUuid: string, targetUuid: string, bondName: string) => Promise<void>
  removeBond: (sourceUuid: string, targetUuid: string, bondName: string) => Promise<void>
}

export function useGraphData(): GraphData {
  const client = useApolloClient()
  const [atoms, setAtoms] = useState<Atom[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchLabelsRef = useRef<string[]>([])
  const searchCategoriesRef = useRef<CategoryFilter[]>([])

  // Surface a clear, mapped message for a known auth/access failure (e.g. acting on an atom the caller
  // cannot touch, or an unknown principal) via the central mapper. Stays silent on session expiry — the
  // Apollo error link signs out globally, so the hook must not flash a raw error (BI-260061 hardening).
  const surfaceAuthError = useCallback((err: unknown) => {
    const outcome = mapAuthError(messageOf(err))
    if (outcome.kind !== 'reauth' && outcome.code) setError(outcome.message)
  }, [])

  const fetchAtoms = useCallback(async (labels?: string[], categories?: CategoryFilter[]) => {
    if (labels !== undefined) {
      searchLabelsRef.current = labels
    }
    if (categories !== undefined) {
      searchCategoriesRef.current = categories
    }
    const activeLabels = searchLabelsRef.current
    const activeCategories = searchCategoriesRef.current
    setLoading(true)
    setError(null)
    try {
      const { data } = await client.query<RetrieveResponse>({
        query: RETRIEVE_QUERY,
        variables: activeLabels.length === 0 && activeCategories.length === 0
          ? undefined
          : {
              ...(activeLabels.length > 0 ? { labels: activeLabels } : {}),
              ...(activeCategories.length > 0 ? { categories: activeCategories } : {}),
            },
        fetchPolicy: 'network-only',
      })

      setAtoms(data?.retrieve ?? [])
    } catch (err) {
      const msg = messageOf(err)
      const outcome = mapAuthError(msg)
      // Session expiry is handled globally (sign-out) — don't render a raw error in its place.
      if (outcome.kind !== 'reauth') {
        setError(outcome.code ? outcome.message : (msg || 'Failed to load graph data'))
      }
    } finally {
      setLoading(false)
    }
  }, [client])

  const createAtom = useCallback(async (title: string, labels: string[], options?: AtomCreationOptions): Promise<string | null> => {
    try {
      const result = await client.mutate({
        mutation: CREATE_ATOMS_MUTATION,
        variables: {
          inputs: [{
            labels,
            properties: {
              nuclearies: { title, description: options?.description ?? '', content: options?.content ?? '', operation: '', constants: {} },
            },
          }],
        },
      })
      const ids = (result.data as Record<string, unknown>)?.change as string[] | undefined
      await fetchAtoms()
      return ids?.[0] ?? null
    } catch (err) {
      // Matches updateAtom/deleteAtom: map known auth codes to the global banner, then rethrow so
      // the caller can react. Without this the rejection escaped as an unhandled promise and the
      // Create button looked inert.
      surfaceAuthError(err)
      throw err
    }
  }, [client, fetchAtoms, surfaceAuthError])

  const toNucleariesInput = useCallback((nuclearies: Atom['properties']['nuclearies']) => ({
    title: nuclearies.title,
    description: nuclearies.description,
    content: nuclearies.content,
    operation: nuclearies.operation,
    constants: nuclearies.constants,
  }), [])

  const stripSystemBonds = useCallback((bonds: Atom['bonds']) =>
    bonds.filter((bond) => bond.name !== 'OP_DEPENDENCY'),
  [])

  const updateAtom = useCallback(async (uuid: string, atom: Atom) => {
    try {
      await client.mutate({
        mutation: UPDATE_ATOM_MUTATION,
        variables: {
          selector: { uuid },
          inputs: [{
            labels: atom.labels,
            // AtomInput.categories has replace-all semantics (schema 9.2.0 / ADR-260063): when
            // present (including []) it REPLACES every assignment; omitted leaves them unchanged.
            // So the field is sent only when the atom carries categories — an atom from an older
            // mock/response without them must not wipe the server-side assignments.
            ...(atom.categories ? { categories: atom.categories.map((c) => ({ valueKey: c.valueKey })) } : {}),
            bonds: stripSystemBonds(atom.bonds).map((b) => ({ uuid: b.uuid, name: b.name, direction: b.direction })),
            properties: { nuclearies: toNucleariesInput(atom.properties.nuclearies) },
          }],
        },
      })
      await fetchAtoms()
    } catch (err) {
      surfaceAuthError(err)
      throw err
    }
  }, [client, fetchAtoms, stripSystemBonds, toNucleariesInput, surfaceAuthError])

  const deleteAtom = useCallback(async (uuid: string) => {
    try {
      await client.mutate<DestroyResponse>({
        mutation: DESTROY_ATOMS_MUTATION,
        variables: { selector: { uuids: [uuid] } },
      })
      await fetchAtoms()
    } catch (err) {
      surfaceAuthError(err)
      throw err
    }
  }, [client, fetchAtoms, surfaceAuthError])

  const addBond = useCallback(async (sourceUuid: string, targetUuid: string, bondName: string) => {
    const source = atoms.find((a) => a.properties.shellies.uuid === sourceUuid)
    if (!source) return

    const updated: Atom = {
      ...source,
      bonds: [...stripSystemBonds(source.bonds), { uuid: targetUuid, name: bondName, direction: 'from' }],
    }
    await updateAtom(sourceUuid, updated)
  }, [atoms, updateAtom, stripSystemBonds])

  const removeBond = useCallback(async (sourceUuid: string, targetUuid: string, bondName: string) => {
    const source = atoms.find((a) => a.properties.shellies.uuid === sourceUuid)
    if (!source) return

    const updated: Atom = {
      ...source,
      bonds: stripSystemBonds(source.bonds).filter(
        (b) => !(b.uuid === targetUuid && b.name === bondName && b.direction === 'from'),
      ),
    }
    await updateAtom(sourceUuid, updated)
  }, [atoms, updateAtom, stripSystemBonds])

  return { atoms, loading, error, refetch: fetchAtoms, search: fetchAtoms, createAtom, updateAtom, deleteAtom, addBond, removeBond }
}
