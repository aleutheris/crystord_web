import { C_BORDER, C_SURFACE, C_PRIMARY, C_TEXT_SECONDARY } from '../styles/tokens'
import type { ViewDescriptor } from './slots/slot-types'

interface GraphViewTabsProps {
  views: ViewDescriptor[]
  activeView: string
  onViewChange: (view: string) => void
}

export function GraphViewTabs({ views, activeView, onViewChange }: GraphViewTabsProps) {
  function handleKeyDown(event: React.KeyboardEvent) {
    const ids = views.map((v) => v.id)
    const idx = ids.indexOf(activeView)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onViewChange(ids[(idx + 1) % ids.length]!)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onViewChange(ids[(idx - 1 + ids.length) % ids.length]!)
    }
  }

  return (
    <div
      role="tablist"
      aria-label="Graph view"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        borderBottom: `1px solid ${C_BORDER}`,
        backgroundColor: C_SURFACE,
        padding: '0 0.5rem',
        flexShrink: 0,
      }}
    >
      {views.map((view) => (
        <button
          key={view.id}
          id={`tab-${view.id}`}
          role="tab"
          type="button"
          aria-selected={activeView === view.id}
          aria-controls="tabpanel-graph"
          tabIndex={activeView === view.id ? 0 : -1}
          onClick={() => onViewChange(view.id)}
          style={{
            padding: '0.4rem 1rem',
            border: 'none',
            borderBottom: activeView === view.id ? `2px solid ${C_PRIMARY}` : '2px solid transparent',
            background: 'transparent',
            color: activeView === view.id ? C_PRIMARY : C_TEXT_SECONDARY,
            fontWeight: activeView === view.id ? 600 : 400,
            cursor: 'pointer',
            fontSize: '0.85rem',
            outline: 'none',
          }}
          onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${C_PRIMARY}` }}
          onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
        >
          {view.label}
        </button>
      ))}
    </div>
  )
}
