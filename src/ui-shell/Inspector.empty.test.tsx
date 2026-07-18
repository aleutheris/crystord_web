import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Inspector } from './Inspector'
import { WorkspaceProvider, type WorkspaceContextValue } from './workspace-context'
import type { Atom } from '../api-contract'

// Defensive edge: the inspector-tab registry is never empty in practice (Details is always
// registered), but Inspector guards for it — exercised here with an empty registry.
vi.mock('./slots', () => ({ inspectorTabs: [] }))

const ATOM = { properties: { shellies: { uuid: 'a1' } } } as unknown as Atom
const value: WorkspaceContextValue = {
  selection: { selectedAtomId: 'a1', selectedAtom: ATOM, select: vi.fn() },
  workingSet: { atoms: [ATOM], filter: { labels: [], categories: [] }, onFilterChange: vi.fn() },
  preferences: {
    homeEmphasis: 'compute',
    computeBadges: 'always',
    leftRailCollapsed: false,
    rightRailCollapsed: false,
    setHomeEmphasis: vi.fn(),
    setComputeBadges: vi.fn(),
    setLeftRailCollapsed: vi.fn(),
    setRightRailCollapsed: vi.fn(),
  },
}

describe('Inspector with an empty inspector-tab registry (defensive)', () => {
  it('renders the chrome with no tabs and an empty tabpanel', () => {
    render(<WorkspaceProvider value={value}><Inspector onUpdate={vi.fn()} onDelete={vi.fn()} /></WorkspaceProvider>)
    expect(screen.getByRole('tablist', { name: /inspector tabs/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collapse inspector/i })).toBeInTheDocument()
    // Arrow keys on an empty tablist are a guarded no-op, not a crash.
    fireEvent.keyDown(screen.getByRole('tablist', { name: /inspector tabs/i }), { key: 'ArrowRight' })
    expect(screen.getByRole('tablist', { name: /inspector tabs/i })).toBeInTheDocument()
  })
})
