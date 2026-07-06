import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LeftRail } from './LeftRail'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'

vi.mock('./slots', () => ({
  navigators: [
    { id: 'labels', label: 'Labels', Component: () => <div data-testid="nav-labels">labels-nav</div> },
  ],
}))

function provide(leftRailCollapsed: boolean, setLeftRailCollapsed = vi.fn()): WorkspaceContextValue {
  return {
    selection: { selectedAtomId: null, selectedAtom: null, select: vi.fn() },
    workingSet: { atoms: [] },
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
