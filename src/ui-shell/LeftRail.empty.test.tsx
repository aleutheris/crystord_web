import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeftRail } from './LeftRail'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'

// Defensive edge: the navigator registry is never empty in practice (Labels is always
// registered), but LeftRail guards for it — exercised here with an empty registry.
vi.mock('./slots', () => ({ navigators: [] }))

const value: WorkspaceContextValue = {
  selection: { selectedAtomId: null, selectedAtom: null, select: vi.fn() },
  workingSet: { atoms: [], filter: { labels: [], categories: [] }, onFilterChange: vi.fn() },
  preferences: {
    homeEmphasis: 'compute',
    computeBadges: 'always',
    leftRailCollapsed: false,
    rightRailCollapsed: false,
    leftRailWidth: 240,
    setHomeEmphasis: vi.fn(),
    setComputeBadges: vi.fn(),
    setLeftRailCollapsed: vi.fn(),
    setRightRailCollapsed: vi.fn(),
    setLeftRailWidth: vi.fn(),
  },
}

describe('LeftRail with an empty navigator registry (defensive)', () => {
  it('renders the Explorer header fallback and no navigator content', () => {
    render(<WorkspaceProvider value={value}><LeftRail /></WorkspaceProvider>)
    expect(screen.getByText('Explorer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collapse explorer/i })).toBeInTheDocument()
  })
})
