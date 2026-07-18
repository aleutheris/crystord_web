import { useState } from 'react'
import { navigators } from './slots'
import { useWorkspace } from './workspace-context'
import { C_BORDER, C_PRIMARY, C_SURFACE, C_TEXT_SECONDARY } from '../styles/tokens'

/**
 * Collapsible left rail — the navigator host (ADR-260061 / EPIC-260066 T5).
 *
 * Renders the active navigator from the registry over the working set; selection and the
 * working-set filter come from context. Collapsed state persists via preferences. With more
 * than one registered navigator the rail shows the registry-driven lens switcher
 * (Labels | Categories), mirroring the `GraphViewTabs` ARIA tab pattern (ADR-260064).
 */
export function LeftRail() {
  const { workingSet, preferences } = useWorkspace()
  const [activeLensId, setActiveLensId] = useState<string>(navigators[0]?.id ?? '')
  const activeNavigator = navigators.find((n) => n.id === activeLensId) ?? navigators[0]

  if (preferences.leftRailCollapsed) {
    return (
      <aside
        aria-label="Explorer"
        style={{ flexShrink: 0, borderRight: `1px solid ${C_BORDER}`, background: C_SURFACE }}
      >
        <button
          type="button"
          aria-label="Expand explorer"
          aria-expanded={false}
          onClick={() => preferences.setLeftRailCollapsed(false)}
          style={{ padding: '0.4rem 0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: C_TEXT_SECONDARY }}
        >
          ▸
        </button>
      </aside>
    )
  }

  function handleLensKeyDown(event: React.KeyboardEvent) {
    // Only reachable from the switcher, which renders solely when navigators exist.
    const ids = navigators.map((n) => n.id)
    const idx = ids.indexOf(activeNavigator!.id)
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      setActiveLensId(ids[(idx + 1) % ids.length]!)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setActiveLensId(ids[(idx - 1 + ids.length) % ids.length]!)
    }
  }

  const showSwitcher = navigators.length > 1
  const Navigator = activeNavigator?.Component
  return (
    <aside
      aria-label="Explorer"
      style={{ flexShrink: 0, width: 240, borderRight: `1px solid ${C_BORDER}`, background: C_SURFACE, display: 'flex', flexDirection: 'column', overflow: 'auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', borderBottom: `1px solid ${C_BORDER}` }}>
        <span style={{ fontWeight: 600, fontSize: '0.8rem', color: C_TEXT_SECONDARY }}>{activeNavigator?.label ?? 'Explorer'}</span>
        <button
          type="button"
          aria-label="Collapse explorer"
          aria-expanded={true}
          onClick={() => preferences.setLeftRailCollapsed(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: C_TEXT_SECONDARY }}
        >
          ◂
        </button>
      </div>
      {showSwitcher && (
        <div
          role="tablist"
          aria-label="Navigator lens"
          tabIndex={0}
          onKeyDown={handleLensKeyDown}
          style={{ display: 'flex', borderBottom: `1px solid ${C_BORDER}`, padding: '0 0.25rem', flexShrink: 0 }}
        >
          {navigators.map((nav) => {
            const selected = nav.id === activeNavigator?.id
            return (
              <button
                key={nav.id}
                id={`lens-tab-${nav.id}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls="navigator-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveLensId(nav.id)}
                style={{
                  padding: '0.3rem 0.6rem',
                  border: 'none',
                  borderBottom: selected ? `2px solid ${C_PRIMARY}` : '2px solid transparent',
                  background: 'transparent',
                  color: selected ? C_PRIMARY : C_TEXT_SECONDARY,
                  fontWeight: selected ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  outline: 'none',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${C_PRIMARY}` }}
                onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
              >
                {nav.label}
              </button>
            )
          })}
        </div>
      )}
      <div
        id="navigator-panel"
        {...(showSwitcher
          ? { role: 'tabpanel', 'aria-labelledby': `lens-tab-${activeNavigator?.id}` }
          : {})}
        style={{ flex: 1, overflow: 'auto' }}
      >
        {Navigator ? (
          <Navigator
            atoms={workingSet.atoms}
            filter={workingSet.filter}
            onFilterChange={workingSet.onFilterChange}
          />
        ) : null}
      </div>
    </aside>
  )
}
