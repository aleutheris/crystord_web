import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeftRail, RESIZE_STEP } from './LeftRail'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'
import { DEFAULT_LEFT_RAIL_WIDTH, LEFT_RAIL_MAX_WIDTH, LEFT_RAIL_MIN_WIDTH } from './use-preferences'
import type { WorkspaceFilter } from '../ui-primitives'

// Two navigators — the registry shape since EPIC-260068 — so the lens switcher renders.
vi.mock('./slots', () => {
  // `help` is required on every descriptor since EPIC-260080 (C2) — the rail ignores it.
  const help = { summary: 'Stub summary.', body: [{ kind: 'paragraph' as const, text: 'Stub body.' }] }
  return {
    navigators: [
      { id: 'labels', label: 'Labels', help, Component: () => <div data-testid="nav-labels">labels-nav</div> },
      {
        id: 'categories',
        label: 'Categories',
        help,
        Component: ({ filter, onFilterChange }: {
          filter?: WorkspaceFilter
          onFilterChange?: (f: WorkspaceFilter) => void
        }) => (
          <div data-testid="nav-categories">
            <span data-testid="filter-json">{JSON.stringify(filter)}</span>
            <button type="button" onClick={() => onFilterChange?.({ labels: [], categories: [] })}>propose</button>
          </div>
        ),
      },
    ],
  }
})

function provide(
  leftRailCollapsed: boolean,
  setLeftRailCollapsed = vi.fn(),
  onFilterChange = vi.fn(),
  leftRailWidth = 240,
  setLeftRailWidth = vi.fn(),
): WorkspaceContextValue {
  return {
    selection: { selectedAtomId: null, selectedAtom: null, select: vi.fn() },
    workingSet: {
      atoms: [],
      filter: { labels: [], categories: [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }] },
      onFilterChange,
    },
    preferences: {
      homeEmphasis: 'compute',
      computeBadges: 'always',
      leftRailCollapsed,
      rightRailCollapsed: false,
      leftRailWidth,
      setHomeEmphasis: vi.fn(),
      setComputeBadges: vi.fn(),
      setLeftRailCollapsed,
      setRightRailCollapsed: vi.fn(),
      setLeftRailWidth,
    },
  }
}

describe('LeftRail', () => {
  it('renders the active navigator when expanded', () => {
    render(<WorkspaceProvider value={provide(false)}><LeftRail /></WorkspaceProvider>)
    expect(screen.getByTestId('nav-labels')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collapse explorer/i })).toBeInTheDocument()
  })

  it('hides the navigator and shows an expand control when collapsed', () => {
    render(<WorkspaceProvider value={provide(true)}><LeftRail /></WorkspaceProvider>)
    expect(screen.queryByTestId('nav-labels')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist', { name: /navigator lens/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expand explorer/i })).toBeInTheDocument()
  })

  it('toggling collapse calls the preference setter', async () => {
    const setLeftRailCollapsed = vi.fn()
    render(<WorkspaceProvider value={provide(false, setLeftRailCollapsed)}><LeftRail /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('button', { name: /collapse explorer/i }))
    expect(setLeftRailCollapsed).toHaveBeenCalledWith(true)
  })

  it('clicking expand in the collapsed state restores the rail', async () => {
    const setLeftRailCollapsed = vi.fn()
    render(<WorkspaceProvider value={provide(true, setLeftRailCollapsed)}><LeftRail /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('button', { name: /expand explorer/i }))
    expect(setLeftRailCollapsed).toHaveBeenCalledWith(false)
  })
})

describe('LeftRail lens switcher (ADR-260064 / EPIC-260068)', () => {
  it('renders a Navigator lens tablist with the first lens selected', () => {
    render(<WorkspaceProvider value={provide(false)}><LeftRail /></WorkspaceProvider>)
    expect(screen.getByRole('tablist', { name: /navigator lens/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveAttribute('aria-selected', 'false')
  })

  it('clicking a lens tab switches the rendered navigator', async () => {
    render(<WorkspaceProvider value={provide(false)}><LeftRail /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('tab', { name: 'Categories' }))
    expect(screen.getByTestId('nav-categories')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-labels')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ArrowRight/ArrowLeft cycle the lenses with wrap-around', () => {
    render(<WorkspaceProvider value={provide(false)}><LeftRail /></WorkspaceProvider>)
    const tablist = screen.getByRole('tablist', { name: /navigator lens/i })
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Categories' })).toHaveAttribute('aria-selected', 'true')
  })

  it('other keys on the lens tablist are a no-op', () => {
    render(<WorkspaceProvider value={provide(false)}><LeftRail /></WorkspaceProvider>)
    fireEvent.keyDown(screen.getByRole('tablist', { name: /navigator lens/i }), { key: 'Enter' })
    expect(screen.getByRole('tab', { name: 'Labels' })).toHaveAttribute('aria-selected', 'true')
  })

  it('passes the working-set filter and onFilterChange to the active navigator', async () => {
    const onFilterChange = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), onFilterChange)}><LeftRail /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('tab', { name: 'Categories' }))
    expect(screen.getByTestId('filter-json').textContent).toContain('"dimensionKey":"region"')
    await userEvent.click(screen.getByRole('button', { name: 'propose' }))
    expect(onFilterChange).toHaveBeenCalledWith({ labels: [], categories: [] })
  })
})

describe('LeftRail resize handle (EPIC-260077 / ADR-260073)', () => {
  it('renders a vertical separator reflecting the current width and bounds', () => {
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '300')
    expect(handle).toHaveAttribute('aria-valuemin', String(LEFT_RAIL_MIN_WIDTH))
    // jsdom's default viewport (1024px) doesn't bind the 60vw cap, so the effective max here
    // equals the fixed max — see the dedicated narrow-viewport test below for the capped case.
    expect(handle).toHaveAttribute('aria-valuemax', String(LEFT_RAIL_MAX_WIDTH))
  })

  it('is absent when the rail is collapsed', () => {
    render(<WorkspaceProvider value={provide(true)}><LeftRail /></WorkspaceProvider>)
    expect(screen.queryByRole('separator', { name: /resize explorer panel/i })).not.toBeInTheDocument()
  })

  it('ArrowRight/ArrowLeft nudge the width by the resize step', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(setLeftRailWidth).toHaveBeenCalledWith(300 + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(setLeftRailWidth).toHaveBeenCalledWith(300 - RESIZE_STEP)
  })

  it('Home/End jump to the min/max bounds', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(setLeftRailWidth).toHaveBeenCalledWith(LEFT_RAIL_MIN_WIDTH)
    fireEvent.keyDown(handle, { key: 'End' })
    expect(setLeftRailWidth).toHaveBeenCalledWith(LEFT_RAIL_MAX_WIDTH)
  })

  it('other keys on the handle are a no-op', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    fireEvent.keyDown(screen.getByRole('separator', { name: /resize explorer panel/i }), { key: 'Enter' })
    expect(setLeftRailWidth).not.toHaveBeenCalled()
  })

  it('double-clicking the handle resets to the default width', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    fireEvent.doubleClick(screen.getByRole('separator', { name: /resize explorer panel/i }))
    expect(setLeftRailWidth).toHaveBeenCalledWith(DEFAULT_LEFT_RAIL_WIDTH)
  })

  it('the rail carries a CSS maxWidth cap so a bare viewport resize stays capped without JS (ADR-260074)', () => {
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300)}><LeftRail /></WorkspaceProvider>)
    const aside = screen.getByRole('complementary', { name: 'Explorer' })
    expect(aside).toHaveStyle({ maxWidth: `min(${LEFT_RAIL_MAX_WIDTH}px, 60vw)` })
  })

  it('aria-valuemax reflects the viewport-capped effective maximum on a narrow viewport', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true })
    try {
      render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300)}><LeftRail /></WorkspaceProvider>)
      // 60% of 600 = 360, tighter than the fixed 480 max.
      expect(screen.getByRole('separator', { name: /resize explorer panel/i })).toHaveAttribute('aria-valuemax', '360')
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    }
  })

  it('End jumps to the viewport-capped effective maximum, not the fixed maximum, on a narrow viewport', () => {
    const originalInnerWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true })
    try {
      const setLeftRailWidth = vi.fn()
      render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
      fireEvent.keyDown(screen.getByRole('separator', { name: /resize explorer panel/i }), { key: 'End' })
      expect(setLeftRailWidth).toHaveBeenCalledWith(360)
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true })
    }
  })

  it('focuses the handle on pointer down, so keyboard nudging works immediately after a drag', () => {
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })
    fireEvent.pointerDown(handle, { clientX: 100 })
    expect(handle).toHaveFocus()
    fireEvent.pointerUp(window)
  })

  it('a non-primary pointer button does not start a drag', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })
    fireEvent.pointerDown(handle, { clientX: 100, button: 2 })
    fireEvent.pointerMove(window, { clientX: 140 })
    expect(setLeftRailWidth).not.toHaveBeenCalled()
    expect(handle).toHaveAttribute('aria-valuenow', '300')
  })

  it('dragging the handle previews the width live and commits once on pointer up', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })

    fireEvent.pointerDown(handle, { clientX: 100, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 140, buttons: 1 })
    // Live preview updates immediately, but the persisted preference isn't touched until release
    // — this is what keeps a drag from writing to localStorage and re-rendering the rest of the
    // shell on every pointermove.
    expect(handle).toHaveAttribute('aria-valuenow', '340')
    expect(setLeftRailWidth).not.toHaveBeenCalled()

    fireEvent.pointerUp(window)
    expect(setLeftRailWidth).toHaveBeenCalledWith(340)

    setLeftRailWidth.mockClear()
    fireEvent.pointerMove(window, { clientX: 200, buttons: 1 })
    expect(setLeftRailWidth).not.toHaveBeenCalled()
  })

  it('treats a pointermove with no buttons held as an implicit release, committing the last pressed position', () => {
    const setLeftRailWidth = vi.fn()
    render(<WorkspaceProvider value={provide(false, vi.fn(), vi.fn(), 300, setLeftRailWidth)}><LeftRail /></WorkspaceProvider>)
    const handle = screen.getByRole('separator', { name: /resize explorer panel/i })

    fireEvent.pointerDown(handle, { clientX: 100, buttons: 1 })
    fireEvent.pointerMove(window, { clientX: 140, buttons: 1 })
    expect(setLeftRailWidth).not.toHaveBeenCalled()

    // Button already released by the time this move is observed (e.g. released outside the
    // viewport before a pointerup could reach us) — commits the last pressed position (340), not
    // this move's own clientX, since the button-up position isn't a real drag endpoint.
    fireEvent.pointerMove(window, { clientX: 200, buttons: 0 })
    expect(setLeftRailWidth).toHaveBeenCalledWith(340)

    setLeftRailWidth.mockClear()
    fireEvent.pointerMove(window, { clientX: 250, buttons: 1 })
    expect(setLeftRailWidth).not.toHaveBeenCalled()
  })
})
