import { useState } from 'react'
import { navigators } from './slots'
import { useWorkspace } from './workspace-context'
import { DEFAULT_LEFT_RAIL_WIDTH, LEFT_RAIL_MAX_WIDTH, LEFT_RAIL_MIN_WIDTH, clampLeftRailWidth, getLeftRailEffectiveMaxWidth } from './use-preferences'
import { C_BORDER, C_PRIMARY, C_SURFACE, C_TEXT_SECONDARY } from '../styles/tokens'

export const RESIZE_STEP = 16
const RESIZE_HANDLE_WIDTH = 6

/**
 * Collapsible left rail — the navigator host (ADR-260061 / EPIC-260066 T5).
 *
 * Renders the active navigator from the registry over the working set; selection and the
 * working-set filter come from context. Collapsed state persists via preferences. With more
 * than one registered navigator the rail shows the registry-driven lens switcher
 * (Labels | Categories), mirroring the `GraphViewTabs` ARIA tab pattern (ADR-260064).
 *
 * The rail's width is user-resizable (ADR-260073 / EPIC-260077): a WAI-ARIA `separator` handle
 * on the right edge supports both pointer drag and keyboard (arrows/Home/End), double-click
 * resets to the default. Width is shared across lenses (not per-lens) and persists independently
 * of collapsed state.
 */
export function LeftRail() {
  const { workingSet, preferences } = useWorkspace()
  const [activeLensId, setActiveLensId] = useState<string>(navigators[0]?.id ?? '')
  const activeNavigator = navigators.find((n) => n.id === activeLensId) ?? navigators[0]
  // Live width while a drag is in progress; null when not dragging, so pointer moves only
  // re-render this component (not every useWorkspace() consumer) and only commit to the
  // persisted preference once, on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null)

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

  function handleResizePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    const handle = event.currentTarget
    const pointerId = event.pointerId
    // Pointer capture keeps pointermove/pointerup routed to us even if the cursor leaves the
    // viewport before release — without it, a release outside the window is never observed and
    // the drag would never end. Guarded with ?. because jsdom (unit tests) doesn't implement it.
    handle.setPointerCapture?.(pointerId)
    handle.focus()
    const startX = event.clientX
    const startWidth = railWidth
    let liveWidth = startWidth
    setDragWidth(liveWidth)

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.buttons === 0) {
        // The button was released without a pointerup reaching us (e.g. released outside the
        // viewport before capture took effect) — treat this move as the end of the drag.
        handleUp()
        return
      }
      liveWidth = clampLeftRailWidth(startWidth + (moveEvent.clientX - startX), window.innerWidth)
      setDragWidth(liveWidth)
    }
    function handleUp() {
      setDragWidth(null)
      preferences.setLeftRailWidth(liveWidth)
      handle.releasePointerCapture?.(pointerId)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  function handleResizeKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      preferences.setLeftRailWidth(railWidth - RESIZE_STEP)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      preferences.setLeftRailWidth(railWidth + RESIZE_STEP)
    } else if (event.key === 'Home') {
      event.preventDefault()
      preferences.setLeftRailWidth(LEFT_RAIL_MIN_WIDTH)
    } else if (event.key === 'End') {
      event.preventDefault()
      preferences.setLeftRailWidth(getLeftRailEffectiveMaxWidth(window.innerWidth))
    }
  }

  const showSwitcher = navigators.length > 1
  const Navigator = activeNavigator?.Component
  const railWidth = dragWidth ?? clampLeftRailWidth(preferences.leftRailWidth, window.innerWidth)
  const effectiveMaxWidth = getLeftRailEffectiveMaxWidth(window.innerWidth)
  return (
    <aside
      aria-label="Explorer"
      style={{
        position: 'relative',
        flexShrink: 0,
        width: railWidth,
        // Continuously re-caps the rendered width on a bare viewport resize with zero JS (no
        // `window.resize` listener) — ADR-260074. The `60vw` here must stay in sync with the
        // `0.6` factor in `getLeftRailEffectiveMaxWidth`; nothing enforces that automatically.
        maxWidth: `min(${LEFT_RAIL_MAX_WIDTH}px, 60vw)`,
        borderRight: `1px solid ${C_BORDER}`,
        background: C_SURFACE,
        display: 'flex',
        flexDirection: 'column',
      }}
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
        style={{ flex: 1, overflow: 'auto', marginRight: RESIZE_HANDLE_WIDTH }}
      >
        {Navigator ? (
          <Navigator
            atoms={workingSet.atoms}
            filter={workingSet.filter}
            onFilterChange={workingSet.onFilterChange}
          />
        ) : null}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize explorer panel"
        aria-valuenow={railWidth}
        aria-valuemin={LEFT_RAIL_MIN_WIDTH}
        aria-valuemax={effectiveMaxWidth}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
        onDoubleClick={() => preferences.setLeftRailWidth(DEFAULT_LEFT_RAIL_WIDTH)}
        onFocus={(e) => { (e.currentTarget as HTMLElement).style.background = C_PRIMARY }}
        onBlur={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        style={{
          // Stays fully inside the aside's own box rather than straddling the edge with a
          // negative offset, so it can't be silently clipped by a scrolling ancestor if one is
          // ever reintroduced here (this is what broke real pointer clicks pre-fix).
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: RESIZE_HANDLE_WIDTH,
          cursor: 'col-resize',
          outline: 'none',
          background: 'transparent',
        }}
      />
    </aside>
  )
}
