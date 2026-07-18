import { Handle, Position, useStore } from '@xyflow/react'
import type { NodeProps, ReactFlowState } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { C_PRIMARY, C_BORDER, C_SELECTION_BG, C_BG, C_TEXT, C_TEXT_SECONDARY, C_SUCCESS, C_ERROR, C_WARNING, C_CARD_BG } from '../../styles/tokens'
import { labelColorToken } from '../../styles/label-colors'
import { lodStateForZoom, truncateValue, capDots, classificationDots } from './node-lod'
import type { LodState } from './node-lod'

/**
 * Flow node data contract (ADR-260061 / EPIC-260066 T7) — the stable, extensible shape the
 * graph adapter puts on each node and the node-extension seam reads. It is intentionally open
 * (`[key: string]: unknown`) so later leaves populate named extension points without changing
 * this type, their concrete shapes defined there:
 *   - `computeStatus` → the **badges** region (EPIC-260069 Compute renders status here)
 *   - `lod`           → the **body** region (EPIC-260072 LOD / Blender blocks render density
 *     here; an explicit `'compact' | 'block'` value overrides the zoom-derived state)
 */
export interface AtomNodeData {
  title: string
  labels: string[]
  isNonFlowAtom?: boolean
  canBond?: boolean
  /** Content value, shown truncated in the block state's monospace meta row (ADR-260067). */
  content?: string
  /** Operation payload; a non-empty string marks the atom computed ("ƒ") in the block header. */
  operation?: string | null
  /** Category assignments; distinct dimension keys render as square dots in the block state. */
  categories?: { dimensionKey: string; valueKey: string }[]
  [key: string]: unknown
}

/**
 * Flow-view atom node, composed of named regions so later leaves extend it without colliding:
 * **handles** (connection points), **badges** (compute status — EPIC-260069), and **body**
 * (zoom-progressive level-of-detail — EPIC-260072). The badges region stays empty until a
 * consumer populates `data.computeStatus`, and composes unchanged over both LOD body states
 * (ADR-260067 seam discipline).
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

const selectZoom = (s: ReactFlowState) => s.transform[2]

/** 8px classification dot — round for labels, square (radius 2) for category dimensions. */
function dotStyle(background: string, shape: 'round' | 'square'): CSSProperties {
  return {
    display: 'inline-block',
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: shape === 'round' ? '50%' : 2,
    background,
  }
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }

/**
 * Body region — zoom-progressive LOD fork (ADR-260067 / EPIC-260072 / REQ-FR-260075): below
 * `LOD_THRESHOLD` a compact chip (label-colored dot + truncated title), at/above it the dense
 * Blender-style block. An explicit `data.lod` ('compact' | 'block') overrides the viewport
 * zoom — the reserved seam contract, letting tests and tools force a state.
 */
function NodeBody({ data, selected }: { data: AtomNodeData; selected: boolean }) {
  const zoom = useStore(selectZoom)
  const override: LodState | undefined =
    data.lod === 'compact' || data.lod === 'block' ? data.lod : undefined
  const lod = override ?? lodStateForZoom(zoom)
  return (
    <div data-node-region="body">
      {lod === 'compact' ? <CompactBody data={data} selected={selected} /> : <BlockBody data={data} selected={selected} />}
    </div>
  )
}

/** Compact chip: one row — first label's palette dot (neutral border color when unlabeled) + title. */
function CompactBody({ data, selected }: { data: AtomNodeData; selected: boolean }) {
  const firstLabel = data.labels[0]
  return (
    <div style={{ ...rowStyle, gap: 6 }}>
      {firstLabel === undefined ? (
        <span aria-hidden="true" style={dotStyle(C_BORDER, 'round')} />
      ) : (
        <span role="img" title={firstLabel} aria-label={firstLabel} style={dotStyle(labelColorToken(firstLabel), 'round')} />
      )}
      <span style={{ fontWeight: selected ? 700 : 600, fontSize: '0.85rem', color: C_TEXT }}>
        {truncateValue(data.title)}
      </span>
    </div>
  )
}

/**
 * Dense block: header (tiny title + "ƒ" computed marker), monospace meta row (truncated
 * content value + compute-status text), and the capped classification dots row. Every dot
 * and the "+N" overflow cell carry their text as tooltip/aria-label (REQ-CR-260011).
 */
function BlockBody({ data, selected }: { data: AtomNodeData; selected: boolean }) {
  const isComputed = data.operation != null && data.operation !== ''
  const value = truncateValue(data.content ?? '')
  const status = isComputeStatus(data.computeStatus) ? data.computeStatus.summary : null
  const dots = classificationDots(data.labels, data.categories ?? [])
  const { visible, overflow } = capDots(dots)
  const hiddenText = dots.slice(visible.length).map((d) => d.text).join(', ')
  return (
    <>
      <div style={rowStyle}>
        <span style={{ fontWeight: selected ? 700 : 600, fontSize: '0.8rem', color: C_TEXT }}>
          {truncateValue(data.title)}
        </span>
        {isComputed && (
          <span role="img" title="Computed atom" aria-label="Computed atom" style={{ fontSize: '0.7rem', fontStyle: 'italic', color: C_TEXT_SECONDARY }}>
            ƒ
          </span>
        )}
      </div>
      {(value !== '' || status !== null) && (
        <div style={{ ...rowStyle, gap: 6, marginTop: 2, fontFamily: 'monospace', fontSize: '0.65rem', color: C_TEXT_SECONDARY }}>
          {value !== '' && <span>{value}</span>}
          {status !== null && <span>{status}</span>}
        </div>
      )}
      {visible.length > 0 && (
        <div role="group" aria-label="Classification" style={{ ...rowStyle, marginTop: 4 }}>
          {visible.map((dot) => (
            <span key={`${dot.shape}-${dot.text}`} role="img" title={dot.text} aria-label={dot.text} style={dotStyle(labelColorToken(dot.text), dot.shape)} />
          ))}
          {overflow > 0 && (
            <span title={hiddenText} aria-label={`${overflow} more: ${hiddenText}`} style={{ fontSize: '0.6rem', color: C_TEXT_SECONDARY }}>
              +{overflow}
            </span>
          )}
        </div>
      )}
    </>
  )
}
