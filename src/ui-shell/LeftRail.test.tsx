import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeftRail } from './LeftRail'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'
import type { WorkspaceFilter } from '../ui-primitives'

// Two navigators — the registry shape since EPIC-260068 — so the lens switcher renders.
vi.mock('./slots', () => ({
  navigators: [
    { id: 'labels', label: 'Labels', Component: () => <div data-testid="nav-labels">labels-nav</div> },
    {
      id: 'categories',
      label: 'Categories',
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
}))

function provide(
  leftRailCollapsed: boolean,
  setLeftRailCollapsed = vi.fn(),
  onFilterChange = vi.fn(),
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
      setHomeEmphasis: vi.fn(),
      setComputeBadges: vi.fn(),
      setLeftRailCollapsed,
      setRightRailCollapsed: vi.fn(),
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
