import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { C_PRIMARY, C_BORDER, C_SELECTION_BG, C_BG, C_TEXT, C_TEXT_SECONDARY } from '../../styles/tokens'

/**
 * Flow node data contract (ADR-260061 / EPIC-260066 T7) — the stable, extensible shape the
 * graph adapter puts on each node and the node-extension seam reads. It is intentionally open
 * (`[key: string]: unknown`) so later leaves populate named extension points without changing
 * this type, their concrete shapes defined there:
 *   - `computeStatus` → the **badges** region (EPIC-260069 Compute renders status here)
 *   - `lod`           → the **body** region (EPIC-260072 LOD / Blender blocks render density here)
 */
export interface AtomNodeData {
  title: string
  labels: string[]
  isNonFlowAtom?: boolean
  canBond?: boolean
  [key: string]: unknown
}

/**
 * Flow-view atom node, composed of named regions so later leaves extend it without colliding:
 * **handles** (connection points), **badges** (compute status — EPIC-260069), and **body**
 * (title + content / level-of-detail — EPIC-260072). The foundation ships the seam only: the
 * badges region stays empty until a consumer populates `data.computeStatus`, so there is no
 * behavior change today.
 */
export function AtomNode({ data, selected }: NodeProps) {
  const nodeData = data as AtomNodeData
  const { title, labels, isNonFlowAtom, canBond } = nodeData
  const labelList = labels.join(', ')
  const tooltip = labelList ? `${title} [${labelList}]` : title
  // Read-side gating: expose the bond-create source handle only when explicitly bondable (fail-closed —
  // a node missing the flag shows no affordance, and onConnect blocks the bond regardless).
  const showBondHandle = canBond === true

  const borderColor = selected ? C_PRIMARY : C_BORDER
  const borderWidth = selected ? 2 : 1
  const borderStyle = isNonFlowAtom ? 'dashed' : 'solid'

  return (
    <>
      {/* handles region */}
      <Handle type="target" position={Position.Left} />
      <div
        title={tooltip}
        aria-label={tooltip}
        style={{
          position: 'relative',
          padding: '8px 14px',
          borderRadius: 6,
          border: `${borderWidth}px ${borderStyle} ${borderColor}`,
          background: selected ? C_SELECTION_BG : C_BG,
          minWidth: 100,
          textAlign: 'center',
          cursor: 'grab',
          opacity: isNonFlowAtom ? 0.55 : 1,
        }}
      >
        <NodeBadges data={nodeData} />
        <NodeBody data={nodeData} selected={selected === true} />
      </div>
      {showBondHandle && <Handle type="source" position={Position.Right} />}
    </>
  )
}

/**
 * Badges region (top-right). EPIC-260069 (Compute) renders status badges from
 * `data.computeStatus`; the foundation ships an empty, gated slot — nothing renders until a
 * consumer populates `computeStatus`, so there is no behavior change today.
 */
function NodeBadges({ data }: { data: AtomNodeData }) {
  if (data.computeStatus === undefined) return null
  return <div data-node-region="badges" style={{ position: 'absolute', top: 2, right: 2 }} />
}

/**
 * Body region — the node's title + content. EPIC-260072 (LOD / Blender blocks) renders
 * zoom-progressive density from `data.lod`; the foundation renders the full title + labels.
 */
function NodeBody({ data, selected }: { data: AtomNodeData; selected: boolean }) {
  const { title, labels } = data
  const labelList = labels.join(', ')
  return (
    <>
      <div style={{ fontWeight: selected ? 700 : 600, fontSize: '0.85rem', color: C_TEXT }}>{title}</div>
      {labels.length > 0 && (
        <div style={{ fontSize: '0.7rem', color: C_TEXT_SECONDARY, marginTop: 2 }}>{labelList}</div>
      )}
    </>
  )
}
