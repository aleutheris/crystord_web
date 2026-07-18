import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { C_PRIMARY, C_BORDER, C_SELECTION_BG, C_BG, C_TEXT, C_TEXT_SECONDARY, C_SUCCESS, C_ERROR, C_WARNING, C_CARD_BG } from '../../styles/tokens'

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

/** Badge shape stamped by GraphCanvas — mirrors api-contract's ComputeStatus (ADR-260065). */
interface NodeComputeStatus {
  kind: 'ok' | 'error' | 'skipped'
  summary: string
}

/** Narrowing guard: `computeStatus` arrives untyped through the open AtomNodeData contract. */
function isComputeStatus(value: unknown): value is NodeComputeStatus {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record['kind'] === 'ok' || record['kind'] === 'error' || record['kind'] === 'skipped') &&
    typeof record['summary'] === 'string'
  )
}

const BADGE_STYLES = {
  ok: { glyph: '✓', text: 'OK', background: C_SUCCESS },
  error: { glyph: '⚠', text: 'Error', background: C_ERROR },
  skipped: { glyph: '⏭', text: 'Skipped', background: C_WARNING },
} as const

/**
 * Badges region (top-right). EPIC-260069 (Compute) renders the status badge from
 * `data.computeStatus` (stamped by GraphCanvas per the `computeBadges` preference): glyph +
 * short text on a status-colored tag, with the summary as title/aria-label — never color
 * alone. The `undefined → null` gate is the reserved seam contract (ADR-260061).
 */
function NodeBadges({ data }: { data: AtomNodeData }) {
  if (data.computeStatus === undefined) return null
  const status = data.computeStatus
  if (!isComputeStatus(status)) {
    return <div data-node-region="badges" style={{ position: 'absolute', top: 2, right: 2 }} />
  }
  const style = BADGE_STYLES[status.kind]
  return (
    <div data-node-region="badges" style={{ position: 'absolute', top: 2, right: 2 }}>
      <span
        role="img"
        title={status.summary}
        aria-label={status.summary}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          fontSize: '0.6rem',
          fontWeight: 600,
          lineHeight: 1,
          padding: '2px 4px',
          borderRadius: 6,
          background: style.background,
          color: C_CARD_BG,
        }}
      >
        {style.glyph} {style.text}
      </span>
    </div>
  )
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
