import { useState } from 'react'
import { inspectorTabs } from './slots'
import { useWorkspace } from './workspace-context'
import { C_BORDER, C_SURFACE, C_PRIMARY, C_TEXT_SECONDARY } from '../styles/tokens'
import type { Atom } from '../api-contract'

interface InspectorProps {
  onUpdate: (uuid: string, atom: Atom) => Promise<void>
  onDelete: (uuid: string) => void
}

/**
 * Right-rail inspector — a tabbed, collapsible host (ADR-260061 / EPIC-260066 T6).
 *
 * Appears when an atom is selected (selection comes from context). Renders a tab strip from the
 * inspector-tab registry (Details today; Classify/Compute/History/Share register in later
 * epics) and the active tab's component in a tabpanel. Collapsed state persists via preferences.
 * The wrapper is intentionally not a landmark — the active tab (e.g. DetailPanel) provides its
 * own complementary region, so it is not nested.
 */
export function Inspector({ onUpdate, onDelete }: InspectorProps) {
  const { selection, preferences } = useWorkspace()
  const [activeTabId, setActiveTabId] = useState<string>(inspectorTabs[0]?.id ?? 'details')

  const atom = selection.selectedAtom
  if (!atom) return null

  if (preferences.rightRailCollapsed) {
    return (
      <div style={{ flexShrink: 0, borderLeft: `1px solid ${C_BORDER}`, background: C_SURFACE }}>
        <button
          type="button"
          aria-label="Expand inspector"
          aria-expanded={false}
          onClick={() => preferences.setRightRailCollapsed(false)}
          style={{ padding: '0.4rem 0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: C_TEXT_SECONDARY }}
        >
          ◂
        </button>
      </div>
    )
  }

  const eligibleTabs = inspectorTabs.filter((t) => !t.when || t.when(atom))
  const activeTab = eligibleTabs.find((t) => t.id === activeTabId) ?? eligibleTabs[0]
  const activeId = activeTab?.id
  const TabComponent = activeTab?.Component

  function handleTabKeyDown(event: React.KeyboardEvent) {
    const ids = eligibleTabs.map((t) => t.id)
    if (ids.length === 0) return
    const idx = ids.indexOf(activeTabId)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setActiveTabId(ids[(idx + 1) % ids.length]!)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setActiveTabId(ids[(idx - 1 + ids.length) % ids.length]!)
    }
  }

  return (
    <div style={{ flexShrink: 0, width: 320, borderLeft: `1px solid ${C_BORDER}`, background: C_SURFACE, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C_BORDER}`, paddingRight: '0.25rem' }}>
        <div role="tablist" aria-label="Inspector tabs" tabIndex={0} onKeyDown={handleTabKeyDown} style={{ display: 'flex' }}>
          {eligibleTabs.map((tab) => (
            <button
              key={tab.id}
              id={`inspector-tab-${tab.id}`}
              role="tab"
              type="button"
              aria-selected={activeId === tab.id}
              aria-controls="inspector-tabpanel"
              tabIndex={activeId === tab.id ? 0 : -1}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderBottom: activeId === tab.id ? `2px solid ${C_PRIMARY}` : '2px solid transparent',
                background: 'transparent',
                color: activeId === tab.id ? C_PRIMARY : C_TEXT_SECONDARY,
                fontWeight: activeId === tab.id ? 600 : 400,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Collapse inspector"
          aria-expanded={true}
          onClick={() => preferences.setRightRailCollapsed(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C_TEXT_SECONDARY }}
        >
          ▸
        </button>
      </div>
      <div
        role="tabpanel"
        id="inspector-tabpanel"
        aria-labelledby={activeTab ? `inspector-tab-${activeTab.id}` : undefined}
        style={{ flex: 1, overflow: 'auto' }}
      >
        {TabComponent ? (
          <TabComponent
            key={atom.properties.shellies.uuid}
            atom={atom}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onClose={() => selection.select(null)}
          />
        ) : null}
      </div>
    </div>
  )
}
