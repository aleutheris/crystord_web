import { useState } from 'react'
import { C_BG, C_BORDER, C_TEXT, C_TEXT_SECONDARY } from '../styles/tokens'

interface GraphLegendProps {
  view: string
}

const NODE_LABEL: Record<string, string> = {
  network: 'Circle = atom (data entity)',
  flow: 'Rectangle = atom (data entity)',
}

export function GraphLegend({ view }: GraphLegendProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      aria-label="Graph legend"
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        zIndex: 10,
        background: C_BG,
        border: `1px solid ${C_BORDER}`,
        borderRadius: 6,
        fontSize: '0.75rem',
        color: C_TEXT,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        minWidth: 180,
      }}
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls="graph-legend-body"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          padding: '0.3rem 0.6rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontWeight: 600,
          fontSize: '0.75rem',
          color: C_TEXT_SECONDARY,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        Legend
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <dl
          id="graph-legend-body"
          style={{ margin: 0, padding: '0 0.6rem 0.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.15rem 0.5rem' }}
        >
          <dt style={{ fontWeight: 600, color: C_TEXT_SECONDARY, whiteSpace: 'nowrap' }}>Node</dt>
          <dd style={{ margin: 0 }}>{NODE_LABEL[view] ?? 'Atom (data entity)'}</dd>

          <dt style={{ fontWeight: 600, color: C_TEXT_SECONDARY }}>Edge</dt>
          <dd style={{ margin: 0 }}>Line = bond (relationship)</dd>

          {view === 'network' && (
            <>
              <dt style={{ fontWeight: 600, color: C_TEXT_SECONDARY, whiteSpace: 'nowrap' }}>Blue dot</dt>
              <dd style={{ margin: 0 }}>Drag to create a relationship</dd>
            </>
          )}

          <dt style={{ fontWeight: 600, color: C_TEXT_SECONDARY }}>Selected</dt>
          <dd style={{ margin: 0 }}>Bold outline + highlighted background</dd>
        </dl>
      )}
    </div>
  )
}
