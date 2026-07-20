import { useCallback, useMemo, useState } from 'react'
import type { Edge, Connection, NodeMouseHandler } from '@xyflow/react'
import type { Atom } from '../../api-contract/graph-queries'
import { atomPermissions } from '../../api-contract/access-control'
import type { GraphData } from './use-graph-data'
import type { UndoEntry } from './UndoNotification'

interface UseCanvasInteractionsProps {
  atoms: Atom[]
  edges: Edge[]
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  deleteAtom: GraphData['deleteAtom']
  createAtom: GraphData['createAtom']
  addBond: GraphData['addBond']
  removeBond: GraphData['removeBond']
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (target.isContentEditable) return true
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function useCanvasInteractions({
  atoms,
  edges,
  selectedAtomId,
  onSelectAtom,
  deleteAtom,
  createAtom,
  addBond,
  removeBond,
}: UseCanvasInteractionsProps) {
  const [pendingConnection, setPendingConnection] = useState<{ source: string; target: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Atom | null>(null)
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null)
  // Canvas-local failure notice. These mutations used to swallow errors on the reasoning that a
  // refetch would correct the state — but that only tells the user *that* nothing changed, never
  // why, which reads as an inert control. The other views (Table, Classify, Board) all carry an
  // equivalent strip; known auth codes additionally reach the global banner via the hook.
  const [actionError, setActionError] = useState<string | null>(null)

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    onSelectAtom(node.id)
  }, [onSelectAtom])

  const onPaneClick = useCallback(() => {
    onSelectAtom(null)
  }, [onSelectAtom])

  const onConnect = useCallback((connection: Connection) => {
    if (connection.source && connection.target && connection.source !== connection.target) {
      // Bond-create is a `change` on the source atom — gate on the caller's access to it (REQ-FR-260069).
      const source = atoms.find((a) => a.properties.shellies.uuid === connection.source)
      if (!atomPermissions(source?.accessLevel).canBond) return
      setPendingConnection({ source: connection.source, target: connection.target })
    }
  }, [atoms])

  const handleBondConfirm = useCallback(async (bondName: string) => {
    if (!pendingConnection) return
    setActionError(null)
    try {
      await addBond(pendingConnection.source, pendingConnection.target, bondName)
    } catch {
      setActionError('Could not create the bond. Please try again.')
    }
    setPendingConnection(null)
  }, [pendingConnection, addBond])

  const handleDeleteRequest = useCallback((atomId: string) => {
    const atom = atoms.find((a) => a.properties.shellies.uuid === atomId)
    // Deletion (`destroy`) is owner-only — never open the confirm for an atom the caller can't delete.
    if (atom && atomPermissions(atom.accessLevel).canDelete) setConfirmDelete(atom)
  }, [atoms])

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmDelete) return
    const deletedAtom = confirmDelete
    setConfirmDelete(null)
    setActionError(null)
    try {
      await deleteAtom(deletedAtom.properties.shellies.uuid)
      setUndoEntry({ type: 'atom', atom: deletedAtom })
      if (selectedAtomId === deletedAtom.properties.shellies.uuid) {
        onSelectAtom(null)
      }
    } catch {
      setActionError('Could not delete the atom. Please try again.')
    }
  }, [confirmDelete, deleteAtom, selectedAtomId, onSelectAtom])

  const handleEdgeDelete = useCallback(async (edgeId: string) => {
    const edge = edges.find((e) => e.id === edgeId)
    if (!edge) return
    const sourceAtom = atoms.find((a) => a.properties.shellies.uuid === edge.source)
    if (!sourceAtom) return
    // Removing a bond rewrites the source atom (`change`) — requires editor-or-higher on it.
    if (!atomPermissions(sourceAtom.accessLevel).canEdit) return
    const bond = sourceAtom.bonds.find(
      (b) => b.uuid === edge.target && b.name === String(edge.label) && b.direction === 'from',
    )
    if (!bond) return
    setActionError(null)
    try {
      await removeBond(edge.source, edge.target, bond.name)
      setUndoEntry({ type: 'bond', atom: sourceAtom, bond })
    } catch {
      setActionError('Could not remove the bond. Please try again.')
    }
  }, [atoms, edges, removeBond])

  const handleUndo = useCallback(async (entry: UndoEntry) => {
    setUndoEntry(null)
    setActionError(null)
    try {
      if (entry.type === 'atom') {
        await createAtom(entry.atom.properties.nuclearies.title, entry.atom.labels)
      } else if (entry.bond) {
        await addBond(entry.atom.properties.shellies.uuid, entry.bond.uuid, entry.bond.name)
      }
    } catch {
      // A failed undo is the worst case to hide: the user believes their delete was reverted.
      setActionError('Could not undo that change. Please try again.')
    }
  }, [createAtom, addBond])

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (isEditableTarget(event.target)) return

    if (event.key === 'Delete' && selectedAtomId) {
      event.preventDefault()
      const selectedEdge = edges.find((e) => e.selected)
      if (selectedEdge) {
        void handleEdgeDelete(selectedEdge.id)
      } else {
        handleDeleteRequest(selectedAtomId)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onSelectAtom(null)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (atoms.length === 0) return
      const idx = selectedAtomId ? atoms.findIndex((a) => a.properties.shellies.uuid === selectedAtomId) : -1
      onSelectAtom(atoms[(idx + 1) % atoms.length]!.properties.shellies.uuid)
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      if (atoms.length === 0) return
      const idx = selectedAtomId ? atoms.findIndex((a) => a.properties.shellies.uuid === selectedAtomId) : 0
      onSelectAtom(atoms[(idx - 1 + atoms.length) % atoms.length]!.properties.shellies.uuid)
    }
  }, [selectedAtomId, atoms, edges, onSelectAtom, handleDeleteRequest, handleEdgeDelete])

  const pendingSource = useMemo(() =>
    pendingConnection ? atoms.find((a) => a.properties.shellies.uuid === pendingConnection.source) : null,
    [pendingConnection, atoms],
  )

  const pendingTarget = useMemo(() =>
    pendingConnection ? atoms.find((a) => a.properties.shellies.uuid === pendingConnection.target) : null,
    [pendingConnection, atoms],
  )

  const dismissActionError = useCallback(() => setActionError(null), [])

  return {
    pendingConnection,
    confirmDelete,
    undoEntry,
    actionError,
    dismissActionError,
    pendingSource,
    pendingTarget,
    onNodeClick,
    onPaneClick,
    onConnect,
    onKeyDown,
    handleBondConfirm,
    handleDeleteConfirm,
    handleUndo,
    setPendingConnection,
    setConfirmDelete,
    setUndoEntry,
  }
}
