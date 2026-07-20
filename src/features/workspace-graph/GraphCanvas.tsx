import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Node, Edge } from '@xyflow/react'
import { computeStatusFor } from '../../api-contract'
import type { ComputeStatus } from '../../api-contract'
import type { GraphData } from './use-graph-data'
import { atomsToNodes, atomsToFlowEdges, mergeNodePositions, cycleEdgeKeys, applyCycleStyling } from './graph-types'
import { FLOW_ELIGIBLE_BONDS, getFlowParticipantIds } from './flow-projection'
import { applyFlowLayout } from './use-flow-layout'
import { AtomNode } from './AtomNode'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { UndoNotification } from './UndoNotification'
import { BondNameDialog } from './BondNameDialog'
import { useCanvasInteractions } from './use-canvas-interactions'
import { CanvasActionNotice } from './CanvasActionNotice'
import { C_PRIMARY, C_CARD_BG, C_ERROR } from '../../styles/tokens'

export type FlowProjectionMode = 'focused' | 'include'

export interface GraphCanvasProps {
  data: GraphData
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  onCreateAtom: () => void
  renderMode?: 'full' | 'reduced'
  /** Badge visibility preference (ADR-260065): absent = 'always'; 'onDemand' = selected atom only. */
  computeBadges?: 'always' | 'onDemand'
}

const nodeTypes = { atom: AtomNode }

export function GraphCanvas({ data, selectedAtomId, onSelectAtom, onCreateAtom, computeBadges }: GraphCanvasProps) {
  const { atoms, loading, error, createAtom, deleteAtom, addBond, removeBond } = data

  // Default is Focused mode (eligible-bond projection only — D1/D2 / ADR-260040)
  const [flowMode, setFlowMode] = useState<FlowProjectionMode>('focused')

  const eligibleSet = useMemo(() => new Set(FLOW_ELIGIBLE_BONDS), [])

  // Participant IDs used for focused filtering and non-flow visual marking in include mode
  const participantIds = useMemo(
    () => getFlowParticipantIds(atoms, eligibleSet),
    [atoms, eligibleSet],
  )

  // Focused mode: eligible-bond participants only. Include mode: full search dataset (D1 / REQ-FR-260047)
  const visibleAtoms = useMemo(
    () => flowMode === 'focused'
      ? atoms.filter((a) => participantIds.has(a.properties.shellies.uuid))
      : atoms,
    [atoms, participantIds, flowMode],
  )

  // Edges always from eligible bonds — non-flow atoms have no eligible bonds to contribute (D4 / ADR-260040).
  // Edges on a reported dependency cycle get danger styling (ADR-260065 / EPIC-260069).
  const flowEdges = useMemo(
    () => applyCycleStyling(atomsToFlowEdges(atoms, eligibleSet), cycleEdgeKeys(atoms)),
    [atoms, eligibleSet],
  )

  // Non-flow atoms in include mode carry isNonFlowAtom=true for visual distinction (D4 / REQ-FR-260047)
  const rawNodes = useMemo(
    () => atomsToNodes(visibleAtoms).map((n) => ({
      ...n,
      data: {
        ...n.data,
        isNonFlowAtom: flowMode === 'include' && !participantIds.has(n.id),
      },
    })),
    [visibleAtoms, participantIds, flowMode],
  )

  // LR layout memoized per rawNodes so it doesn't rerun on selectedAtomId changes (D3 / REQ-FR-260045)
  const laidNodes = useMemo(() => applyFlowLayout(rawNodes, flowEdges), [rawNodes, flowEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setEdges(flowEdges)
  }, [flowEdges, setEdges])

  // Compute-status badge model per atom (ADR-260065), stamped into the reserved badges seam.
  const statusById = useMemo(() => {
    const map = new Map<string, ComputeStatus | undefined>()
    for (const atom of atoms) map.set(atom.properties.shellies.uuid, computeStatusFor(atom))
    return map
  }, [atoms])

  // Selection + badge stamping happen here (not in rawNodes) so the layout memo above never
  // reruns on selection changes (D3 / REQ-FR-260045). `onDemand` badges only the selected atom.
  const badgeMode = computeBadges ?? 'always'
  const decorateNodes = useCallback((ns: Node[]) => ns.map((n) => {
    const showBadge = badgeMode === 'always' || n.id === selectedAtomId
    return {
      ...n,
      selected: n.id === selectedAtomId,
      data: { ...n.data, computeStatus: showBadge ? statusById.get(n.id) : undefined },
    }
  }), [selectedAtomId, badgeMode, statusById])

  useEffect(() => {
    setNodes((prev) => decorateNodes(mergeNodePositions(laidNodes, prev)))
  }, [laidNodes, decorateNodes, setNodes])

  // Relayout preserves selectedAtomId and drag-repositioned nodes remain moveable afterward (D3 / REQ-FR-260045)
  function handleRelayout() {
    setNodes(decorateNodes(applyFlowLayout(rawNodes, flowEdges)))
  }

  function toggleFlowMode() {
    setFlowMode((m) => (m === 'focused' ? 'include' : 'focused'))
  }

  const ix = useCanvasInteractions({ atoms, edges, selectedAtomId, onSelectAtom, deleteAtom, createAtom, addBond, removeBond })

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading graph…</div>
  }

  if (error) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C_ERROR }}>{error}</div>
  }

  return (
    <div
      role="region"
      aria-label="Flow view graph canvas"
      tabIndex={0}
      style={{ width: '100%', height: '100%', outline: 'none', position: 'relative' }}
      onKeyDown={ix.onKeyDown}
    >
      {ix.actionError && (
        <CanvasActionNotice message={ix.actionError} onDismiss={ix.dismissActionError} />
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={ix.onConnect}
        onNodeClick={ix.onNodeClick}
        onPaneClick={ix.onPaneClick}
        fitView
        deleteKeyCode={null}
      >
        <Background />
        <Controls />
        <Panel position="top-right">
          <button
            type="button"
            onClick={onCreateAtom}
            aria-label="Create atom"
            style={{ padding: '0.25rem 0.75rem', cursor: 'pointer', marginRight: '0.5rem', background: C_PRIMARY, color: C_CARD_BG, border: 'none', borderRadius: 4, fontWeight: 600 }}
          >
            Create Atom
          </button>
          <button
            type="button"
            onClick={handleRelayout}
            aria-label="Re-layout flow graph"
            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer', marginRight: '0.25rem' }}
          >
            Re-layout
          </button>
          <button
            type="button"
            aria-pressed={flowMode === 'include'}
            onClick={toggleFlowMode}
            aria-label="Toggle non-flow atom inclusion"
            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
          >
            Include all
          </button>
        </Panel>
      </ReactFlow>

      {ix.confirmDelete && (
        <DeleteConfirmDialog
          atomTitle={ix.confirmDelete.properties.nuclearies.title}
          onConfirm={ix.handleDeleteConfirm}
          onCancel={() => ix.setConfirmDelete(null)}
        />
      )}

      {ix.pendingConnection && ix.pendingSource && ix.pendingTarget && (
        <BondNameDialog
          sourceTitle={ix.pendingSource.properties.nuclearies.title}
          targetTitle={ix.pendingTarget.properties.nuclearies.title}
          onConfirm={ix.handleBondConfirm}
          onCancel={() => ix.setPendingConnection(null)}
        />
      )}

      {ix.undoEntry && (
        <UndoNotification
          entry={ix.undoEntry}
          onUndo={ix.handleUndo}
          onExpire={() => ix.setUndoEntry(null)}
        />
      )}
    </div>
  )
}
