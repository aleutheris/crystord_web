import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inspector } from './Inspector'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'
import type { Atom } from '../api-contract'

vi.mock('./slots', () => ({
  inspectorTabs: [
    {
      id: 'details',
      label: 'Details',
      Component: ({ atom, onClose }: { atom: Atom; onClose: () => void }) => (
        <div data-testid="details-tab">
          {atom.properties.shellies.uuid}
          <button type="button" onClick={onClose}>close</button>
        </div>
      ),
    },
    {
      id: 'extra',
      label: 'Extra',
      Component: () => <div data-testid="extra-tab">extra</div>,
    },
    {
      id: 'hidden',
      label: 'Hidden',
      when: () => false,
      Component: () => <div data-testid="hidden-tab">hidden</div>,
    },
  ],
}))

const ATOM = { properties: { shellies: { uuid: 'a1' } } } as unknown as Atom

function provide(
  selectedAtom: Atom | null,
  opts: { select?: (id: string | null) => void; rightRailCollapsed?: boolean; setRightRailCollapsed?: (v: boolean) => void } = {},
): WorkspaceContextValue {
  return {
    selection: {
      selectedAtomId: selectedAtom?.properties.shellies.uuid ?? null,
      selectedAtom,
      select: opts.select ?? vi.fn(),
    },
    workingSet: { atoms: selectedAtom ? [selectedAtom] : [], filter: { labels: [], categories: [] }, onFilterChange: vi.fn() },
    preferences: {
      homeEmphasis: 'compute',
      computeBadges: 'always',
      leftRailCollapsed: false,
      rightRailCollapsed: opts.rightRailCollapsed ?? false,
      setHomeEmphasis: vi.fn(),
      setComputeBadges: vi.fn(),
      setLeftRailCollapsed: vi.fn(),
      setRightRailCollapsed: opts.setRightRailCollapsed ?? vi.fn(),
    },
  }
}

describe('Inspector', () => {
  it('renders nothing when no atom is selected', () => {
    render(<WorkspaceProvider value={provide(null)}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    expect(screen.queryByTestId('details-tab')).not.toBeInTheDocument()
  })

  it('renders a tabbed inspector with the Details tab for the selected atom', () => {
    render(<WorkspaceProvider value={provide(ATOM)}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByTestId('details-tab')).toHaveTextContent('a1')
  })

  it('closing the active tab clears the selection via context (onClose → select(null))', async () => {
    const select = vi.fn()
    render(<WorkspaceProvider value={provide(ATOM, { select })}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(select).toHaveBeenCalledWith(null)
  })

  it('collapses to an expand control when rightRailCollapsed', () => {
    render(<WorkspaceProvider value={provide(ATOM, { rightRailCollapsed: true })}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    expect(screen.queryByTestId('details-tab')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /expand inspector/i })).toBeInTheDocument()
  })

  it('collapse toggle persists via the preference setter', async () => {
    const setRightRailCollapsed = vi.fn()
    render(<WorkspaceProvider value={provide(ATOM, { setRightRailCollapsed })}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('button', { name: /collapse inspector/i }))
    expect(setRightRailCollapsed).toHaveBeenCalledWith(true)
  })

  it('switches the active tab on click', async () => {
    render(<WorkspaceProvider value={provide(ATOM)}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('tab', { name: 'Extra' }))
    expect(screen.getByRole('tab', { name: 'Extra' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('extra-tab')).toBeInTheDocument()
  })

  it('supports arrow-key tab navigation (WAI-ARIA roving tabindex)', () => {
    render(<WorkspaceProvider value={provide(ATOM)}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    const tablist = screen.getByRole('tablist', { name: /inspector tabs/i })
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Extra' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('extra-tab')).toBeInTheDocument()

    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking expand in the collapsed state restores the inspector', async () => {
    const setRightRailCollapsed = vi.fn()
    render(<WorkspaceProvider value={provide(ATOM, { rightRailCollapsed: true, setRightRailCollapsed })}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    await userEvent.click(screen.getByRole('button', { name: /expand inspector/i }))
    expect(setRightRailCollapsed).toHaveBeenCalledWith(false)
  })

  it('ignores non-arrow keys on the tablist', () => {
    render(<WorkspaceProvider value={provide(ATOM)}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    fireEvent.keyDown(screen.getByRole('tablist', { name: /inspector tabs/i }), { key: 'ArrowDown' })
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
  })

  it('filters out tabs whose when(atom) predicate is false', () => {
    render(<WorkspaceProvider value={provide(ATOM)}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    expect(screen.queryByRole('tab', { name: 'Hidden' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
  })
})
