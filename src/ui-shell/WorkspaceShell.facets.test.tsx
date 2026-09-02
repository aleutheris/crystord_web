import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceShell } from './WorkspaceShell'
import type { WorkspaceFilter } from '../ui-primitives'

// Facet scoping integration (ADR-260064 / EPIC-260068 T4): the shell owns the facet state; a
// navigator's onFilterChange lands as header chips, a wider query summary, and an immediate
// re-fetch that keeps the committed labels (search(undefined, facets)).

const mockSearch = vi.fn()

vi.mock('../features/auth-entry', () => ({
  useLogout: () => vi.fn(),
  useAuth: () => ({ signOut: vi.fn() }),
}))

vi.mock('../features/account-settings', () => ({
  AccountSettingsPanel: () => null,
  useAccountInfo: () => ({ account: null, loading: true, error: null, refetch: vi.fn() }),
}))

vi.mock('../features/workspace-admin', () => ({
  WorkspacePanel: () => null,
}))

vi.mock('../features/workspace-graph', () => ({
  useGraphData: () => ({
    atoms: [],
    loading: false,
    error: null,
    search: mockSearch,
    createAtom: vi.fn(),
    updateAtom: vi.fn(),
    deleteAtom: vi.fn(),
    addBond: vi.fn(),
    removeBond: vi.fn(),
  }),
  useGraphDegrade: () => ({ mode: 'full', confirmRender: vi.fn() }),
  DeleteConfirmDialog: () => null,
}))

vi.mock('./GraphLegend', () => ({ GraphLegend: () => null }))

vi.mock('../features/workspace-search', () => ({
  useSearch: () => ({
    filters: { labelQuery: '', selectedLabels: [] },
    setLabelQuery: vi.fn(),
    toggleLabel: vi.fn(),
    clearFilters: vi.fn(),
    submitSearch: vi.fn(),
    commitLabelFromInput: vi.fn(),
    removeLastLabel: vi.fn(),
    hasSubmitted: true,
    filteredAtoms: [],
    availableLabels: [],
    querySummary: 'Labels: Project',
    isActive: true,
  }),
  useRecommendedLabels: () => ({ labels: [], loading: false }),
  SearchBar: () => <div data-testid="search-bar" />,
  QuerySummary: ({ summary }: { summary: string }) => <div data-testid="query-summary">{summary}</div>,
}))

vi.mock('../features/workspace-details', () => ({
  DetailPanel: () => null,
  CreationNotification: () => null,
}))

vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// A minimal registry: one view and one navigator that proposes a facet filter on click.
vi.mock('./slots', () => {
  // `help` is required on every descriptor since EPIC-260080 (C2); only the help panel reads it.
  const help = { summary: 'Stub summary.', body: [{ kind: 'paragraph' as const, text: 'Stub body.' }] }
  return {
    enabledViews: [{ id: 'flow', label: 'Flow', help, Component: () => <div data-testid="view" /> }],
    initialActiveView: () => 'flow',
    inspectorTabs: [],
    navigators: [
      {
        id: 'categories',
        label: 'Categories',
        help,
        Component: ({ onFilterChange }: { onFilterChange?: (f: WorkspaceFilter) => void }) => (
          <button
            type="button"
            onClick={() => onFilterChange?.({
              labels: [],
              categories: [{ dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true }],
            })}
          >
            propose facet
          </button>
        ),
      },
    ],
  }
})

beforeEach(() => {
  mockSearch.mockClear()
})

describe('WorkspaceShell facet scoping (ADR-260064)', () => {
  it('a navigator filter change re-fetches immediately, keeping committed labels', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: 'propose facet' }))
    expect(mockSearch).toHaveBeenCalledWith(undefined, [
      { dimensionKey: 'region', valueKeys: ['europe'], includeDescendants: true },
    ])
  })

  it('facets render as removable header chips and extend the query summary', async () => {
    render(<WorkspaceShell />)
    expect(screen.getByTestId('query-summary')).toHaveTextContent('Labels: Project')

    await userEvent.click(screen.getByRole('button', { name: 'propose facet' }))
    expect(screen.getByRole('group', { name: 'Category filters' })).toHaveTextContent('region ▸ europe')
    expect(screen.getByTestId('query-summary')).toHaveTextContent('Labels: Project · region ▸ europe')
  })

  it('removing a chip clears the facet and re-fetches without categories', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: 'propose facet' }))
    mockSearch.mockClear()

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter region ▸ europe' }))
    expect(mockSearch).toHaveBeenCalledWith(undefined, [])
    expect(screen.queryByRole('group', { name: 'Category filters' })).not.toBeInTheDocument()
    expect(screen.getByTestId('query-summary')).toHaveTextContent('Labels: Project')
  })
})
