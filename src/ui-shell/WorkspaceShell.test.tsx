import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceShell } from './WorkspaceShell'

const { mockLogout, mockSignOut } = vi.hoisted(() => ({ mockLogout: vi.fn(), mockSignOut: vi.fn() }))

vi.mock('../features/auth-entry', () => ({
  useLogout: () => mockLogout,
  useAuth: () => ({ signOut: mockSignOut }),
}))

vi.mock('../features/account-settings', () => ({
  AccountSettingsPanel: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Account settings">
      <button type="button" onClick={onClose}>close settings</button>
    </div>
  ),
  useAccountInfo: () => ({
    account: { username: 'demo.user', email: 'demo@crystord.test', emailVerified: true, authMethods: ['password'] },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('../features/workspace-admin', () => ({
  WorkspacePanel: ({ onClose, selfUsername }: { onClose: () => void; selfUsername?: string }) => (
    <div role="dialog" aria-label="Workspaces" data-self-username={selfUsername}>
      <button type="button" onClick={onClose}>close workspaces</button>
    </div>
  ),
}))

const mockSearch = vi.fn()
const mockCreateAtom = vi.fn()

vi.mock('../features/workspace-graph', () => ({
  useGraphData: () => ({
    atoms: [],
    loading: false,
    error: null,
    search: mockSearch,
    createAtom: mockCreateAtom,
    updateAtom: vi.fn(),
    deleteAtom: vi.fn(),
    addBond: vi.fn(),
    removeBond: vi.fn(),
  }),
  useGraphDegrade: () => ({ mode: 'full', confirmRender: vi.fn() }),
  GraphCanvas: ({ onCreateAtom }: { onCreateAtom: () => void }) => (
    <div data-testid="flow-canvas">
      <button type="button" onClick={onCreateAtom} aria-label="Create atom">Create Atom</button>
    </div>
  ),
  NetworkCanvas: ({ onCreateAtom }: { onCreateAtom: () => void }) => (
    <div data-testid="network-canvas">
      <button type="button" onClick={onCreateAtom} aria-label="Create atom">Create Atom</button>
    </div>
  ),
  DeleteConfirmDialog: () => null,
}))

vi.mock('./GraphLegend', () => ({
  GraphLegend: () => null,
}))

vi.mock('../features/workspace-search', () => ({
  useSearch: () => ({
    filters: { labelQuery: '', selectedLabels: [] },
    setLabelQuery: vi.fn(),
    toggleLabel: vi.fn(),
    clearFilters: vi.fn(),
    submitSearch: vi.fn(),
    commitLabelFromInput: vi.fn(),
    removeLastLabel: vi.fn(),
    hasSubmitted: false,
    filteredAtoms: [],
    availableLabels: [],
    querySummary: '',
    isActive: false,
  }),
  useRecommendedLabels: () => ({ labels: [], loading: false }),
  SearchBar: () => <div data-testid="search-bar" />,
  QuerySummary: () => null,
  SearchResultPanel: () => <div data-testid="search-result-panel" />,
}))

vi.mock('../features/workspace-details', () => ({
  DetailPanel: ({ isCreationMode, onCreate, onClose }: {
    isCreationMode?: boolean
    onCreate?: (t: string, l: string[], d: string, c: string) => Promise<void>
    onClose: () => void
  }) => (
    <div data-testid={isCreationMode ? 'creation-panel' : 'detail-panel'}>
      {isCreationMode && (
        <>
          <h2>Create New Atom</h2>
          <button type="button" onClick={() => void onCreate?.('My Atom', ['Tag'], '', '')}>Create</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </>
      )}
    </div>
  ),
  CreationNotification: ({ message }: { message: string }) => (
    <div role="status" aria-label="Atom created">{message}</div>
  ),
}))

vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('WorkspaceShell view switching', () => {
  // The initial view derives from the persisted homeEmphasis preference (ADR-260065), so
  // each test starts from a clean store — the default emphasis is compute → Flow lands.
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders Flow view as the default under the compute home emphasis (ADR-260065)', () => {
    render(<WorkspaceShell />)
    expect(screen.getByRole('tab', { name: 'Flow' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('flow-canvas')).toBeInTheDocument()
  })

  it('does not render the Network canvas by default', () => {
    render(<WorkspaceShell />)
    expect(screen.queryByTestId('network-canvas')).not.toBeInTheDocument()
  })

  it('renders Network view as the default when home emphasis is relationship', () => {
    localStorage.setItem('crystord-home-emphasis', 'relationship')
    render(<WorkspaceShell />)
    expect(screen.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('network-canvas')).toBeInTheDocument()
  })

  it('switches to Network canvas when Network tab is clicked', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('tab', { name: 'Network' }))
    expect(screen.getByTestId('network-canvas')).toBeInTheDocument()
    expect(screen.queryByTestId('flow-canvas')).not.toBeInTheDocument()
  })

  it('switches back to Flow canvas when Flow tab is re-clicked', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('tab', { name: 'Network' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Flow' }))
    expect(screen.getByTestId('flow-canvas')).toBeInTheDocument()
    expect(screen.queryByTestId('network-canvas')).not.toBeInTheDocument()
  })

  it('does not invoke search when switching views', async () => {
    mockSearch.mockClear()
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('tab', { name: 'Network' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Flow' }))
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('header and search bar remain visible when switching views', async () => {
    render(<WorkspaceShell />)
    expect(screen.getByText('Crystord')).toBeInTheDocument()
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Network' }))
    expect(screen.getByText('Crystord')).toBeInTheDocument()
    expect(screen.getByTestId('search-bar')).toBeInTheDocument()
  })

  it('view tabs are visible before any search is submitted', () => {
    render(<WorkspaceShell />)
    // Scoped: the LeftRail lens switcher (ADR-260064) is a second tablist.
    expect(screen.getByRole('tablist', { name: 'Graph view' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Network' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Flow' })).toBeInTheDocument()
  })

  // The header controls are consolidated into the AccountMenu dropdown (ADR-260066).
  it('Sign Out menu item triggers logout (server revocation + local clear)', async () => {
    mockLogout.mockClear()
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(mockLogout).toHaveBeenCalledOnce()
  })

  it('opens the account settings panel from the account menu', async () => {
    render(<WorkspaceShell />)
    expect(screen.queryByRole('dialog', { name: /account settings/i })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /account settings/i }))
    expect(screen.getByRole('dialog', { name: /account settings/i })).toBeInTheDocument()
  })

  it('closes the account settings panel via onClose', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /account settings/i }))
    await userEvent.click(screen.getByRole('button', { name: /close settings/i }))
    expect(screen.queryByRole('dialog', { name: /account settings/i })).not.toBeInTheDocument()
  })

  it('opens the workspace panel from the menu, threading the caller username (ADR-260066)', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /workspaces/i }))
    const panel = screen.getByRole('dialog', { name: /workspaces/i })
    expect(panel).toHaveAttribute('data-self-username', 'demo.user')
    await userEvent.click(screen.getByRole('button', { name: /close workspaces/i }))
    expect(screen.queryByRole('dialog', { name: /workspaces/i })).not.toBeInTheDocument()
  })

  it('opens the preferences panel from the menu (inside the WorkspaceProvider)', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /preferences/i }))
    const dialog = screen.getByRole('dialog', { name: 'Preferences' })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close preferences' }))
    expect(screen.queryByRole('dialog', { name: 'Preferences' })).not.toBeInTheDocument()
  })
})

describe('WorkspaceShell atom creation flow', () => {
  it('shows creation panel when Create Atom button is clicked', async () => {
    render(<WorkspaceShell />)
    expect(screen.queryByTestId('creation-panel')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /create atom/i }))
    expect(screen.getByTestId('creation-panel')).toBeInTheDocument()
  })

  it('shows backdrop overlay when creation panel is open', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: /create atom/i }))
    expect(document.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('creation overlay is an accessible modal dialog', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: /create atom/i }))
    const dialog = screen.getByRole('dialog', { name: /create atom/i })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('closes creation panel when Cancel is clicked', async () => {
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: /create atom/i }))
    expect(screen.getByTestId('creation-panel')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByTestId('creation-panel')).not.toBeInTheDocument()
  })

  it('calls createAtom and shows success notification after creation', async () => {
    mockCreateAtom.mockResolvedValue('new-id')
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: /create atom/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => {
      expect(mockCreateAtom).toHaveBeenCalledWith('My Atom', ['Tag'], { description: '', content: '' })
    })
    expect(screen.getByRole('status', { name: /atom created/i })).toBeInTheDocument()
  })

  it('closes creation panel after successful creation', async () => {
    mockCreateAtom.mockResolvedValue('new-id')
    render(<WorkspaceShell />)
    await userEvent.click(screen.getByRole('button', { name: /create atom/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))
    await waitFor(() => {
      expect(screen.queryByTestId('creation-panel')).not.toBeInTheDocument()
    })
  })
})
