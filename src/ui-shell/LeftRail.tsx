import { navigators } from './slots'
import { useWorkspace } from './workspace-context'
import { C_BORDER, C_SURFACE, C_TEXT_SECONDARY } from '../styles/tokens'

/**
 * Collapsible left rail — the navigator host (ADR-260061 / EPIC-260066 T5).
 *
 * Renders the active navigator from the registry over the working set; selection comes from
 * context. Collapsed state persists via preferences. With a single navigator there is no lens
 * switcher; a registry-driven switcher (mirroring `GraphViewTabs`) lands with the second
 * navigator (Categories, EPIC-260068).
 */
export function LeftRail() {
  const { workingSet, preferences } = useWorkspace()
  const activeNavigator = navigators[0]

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
      {Navigator ? <Navigator atoms={workingSet.atoms} /> : null}
    </aside>
  )
}
