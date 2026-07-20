import { useEffect, useMemo } from 'react'
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
import type { Atom } from '../../api-contract/graph-queries'
import { atomPermissions } from '../../api-contract/access-control'
import type { GraphData } from './use-graph-data'
import { atomsToNetworkEdges, mergeNodePositions } from './graph-types'
import { applyForceLayout } from './use-network-layout'
import { CircleAtomNode, RING_THICKNESS } from './CircleAtomNode'
import { NetworkConnectionLine } from './NetworkConnectionLine'
import { FloatingEdge } from './FloatingEdge'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { UndoNotification } from './UndoNotification'
import { BondNameDialog } from './BondNameDialog'
import { useCanvasInteractions } from './use-canvas-interactions'
import { CanvasActionNotice } from './CanvasActionNotice'
import { C_PRIMARY, C_CARD_BG, C_ERROR } from '../../styles/tokens'

export interface NetworkCanvasProps {
  data: GraphData
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  onCreateAtom: () => void
  renderMode?: 'full' | 'reduced'
}

const NODE_SIZE = 80
const SPACING = 160
// Acceptance area = node disk radius (40) + outer ring thickness (8) — activates only within disk+ring boundary (D2/D4 / ADR-260038)
const CIRCLE_DROP_RADIUS = NODE_SIZE / 2 + RING_THICKNESS

const nodeTypes = { circleAtom: CircleAtomNode }
const edgeTypes = { floating: FloatingEdge }

function atomsToNetworkNodes(atoms: Atom[]): Node[] {
  const cols = Math.max(1, Math.ceil(Math.sqrt(atoms.length)))
  return atoms.map((atom, i) => ({
    id: atom.properties.shellies.uuid,
    type: 'circleAtom',
    position: { x: (i % cols) * SPACING, y: Math.floor(i / cols) * SPACING },
    data: {
      title: atom.properties.nuclearies.title,
      labels: atom.labels,
      canBond: atomPermissions(atom.accessLevel).canBond,
    },
    style: { width: NODE_SIZE, height: NODE_SIZE },
  }))
}

export function NetworkCanvas({ data, selectedAtomId, onSelectAtom, onCreateAtom }: NetworkCanvasProps) {
  const { atoms, loading, error, createAtom, deleteAtom, addBond, removeBond } = data

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Memoize layout so applyForceLayout (300 D3 ticks) only reruns when atoms change,
  // not on every selectedAtomId change.
  const networkEdges = useMemo(() => atomsToNetworkEdges(atoms), [atoms])
  const laidNodes = useMemo(
    () => applyForceLayout(atomsToNetworkNodes(atoms), networkEdges),
    [atoms, networkEdges],
  )

  useEffect(() => {
    setEdges(networkEdges)
  }, [networkEdges, setEdges])

  // Runs when atoms change (laidNodes ref changes) or selectedAtomId changes.
  // mergeNodePositions preserves user-dragged positions over the laid-out base.
  useEffect(() => {
    setNodes((prev) => {
      const merged = mergeNodePositions(laidNodes, prev)
      return merged.map((n) => ({ ...n, selected: n.id === selectedAtomId }))
    })
  }, [laidNodes, selectedAtomId, setNodes])

  function handleRelayout() {
    setNodes(
      applyForceLayout(atomsToNetworkNodes(atoms), networkEdges)
        .map((n) => ({ ...n, selected: n.id === selectedAtomId })),
    )
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
      aria-label="Network view graph canvas"
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
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={ix.onConnect}
        onNodeClick={ix.onNodeClick}
        onPaneClick={ix.onPaneClick}
        connectionRadius={CIRCLE_DROP_RADIUS}
        connectionLineComponent={NetworkConnectionLine}
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
            aria-label="Re-layout graph"
            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
          >
            Re-layout
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
