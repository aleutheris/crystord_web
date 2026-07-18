import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareTab } from './ShareTab'
import type { Atom, AtomGrant } from '../../api-contract'
import type { AtomGrantsState } from './use-atom-grants'
import type { ShareActions } from './use-share-actions'

const mockUseAtomGrants = vi.fn()
const mockUseShareActions = vi.fn()

vi.mock('./use-atom-grants', () => ({
  useAtomGrants: (uuid: string) => mockUseAtomGrants(uuid) as AtomGrantsState,
}))

vi.mock('./use-share-actions', () => ({
  useShareActions: (uuid: string, refetch: () => Promise<void>) =>
    mockUseShareActions(uuid, refetch) as ShareActions,
}))

function makeAtom(): Atom {
  return {
    labels: ['Project'],
    bonds: [],
    accessLevel: 'OWNER',
    properties: {
      shellies: { uuid: 'atom-1' },
      nuclearies: { title: 'Alpha', description: '', content: '', operation: null, constants: null },
    },
  }
}

function makeGrant(name: string): AtomGrant {
  return {
    principalUuid: `uuid-${name}`,
    principalType: 'USER',
    principalName: name,
    level: 'VIEWER',
    grantedAt: '2026-07-01T10:00:00Z',
    grantedBy: 'owner-1',
  }
}

const refetch = vi.fn<() => Promise<void>>(async () => undefined)

function grantsState(overrides?: Partial<AtomGrantsState>): AtomGrantsState {
  return { grants: [makeGrant('bob')], loading: false, error: null, refetch, ...overrides }
}

function actionsState(overrides?: Partial<ShareActions>): ShareActions {
  return {
    pending: false,
    feedback: null,
    share: vi.fn(async () => true),
    revoke: vi.fn(async () => true),
    ...overrides,
  }
}

beforeEach(() => {
  mockUseAtomGrants.mockReset()
  mockUseShareActions.mockReset()
  mockUseAtomGrants.mockReturnValue(grantsState())
  mockUseShareActions.mockReturnValue(actionsState())
})

describe('ShareTab — wiring (ADR-260069)', () => {
  it('fetches grants for the selected atom and threads the refetch into the actions', () => {
    render(<ShareTab atom={makeAtom()} />)

    expect(mockUseAtomGrants).toHaveBeenCalledWith('atom-1')
    expect(mockUseShareActions).toHaveBeenCalledWith('atom-1', refetch)
  })

  it('states the caller level and renders the grants list and grant form', () => {
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByRole('heading', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByText('You own this atom.')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Access grants' })).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('confirming a row revoke calls the revoke action with the principal', async () => {
    const revoke = vi.fn(async () => true)
    mockUseShareActions.mockReturnValue(actionsState({ revoke }))
    render(<ShareTab atom={makeAtom()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Revoke access for bob' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))

    expect(revoke).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith('bob', 'USER')
  })

  it('submitting the form calls the share action', async () => {
    const share = vi.fn(async () => true)
    mockUseShareActions.mockReturnValue(actionsState({ share }))
    render(<ShareTab atom={makeAtom()} />)

    await userEvent.type(screen.getByLabelText('Username'), 'carol')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(share).toHaveBeenCalledOnce()
    expect(share).toHaveBeenCalledWith('carol', 'USER', 'VIEWER')
  })
})

describe('ShareTab — states (ADR-260069)', () => {
  it('shows the loading state while the grants are in flight', () => {
    mockUseAtomGrants.mockReturnValue(grantsState({ grants: [], loading: true }))
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByText('Loading grants…')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('announces a load failure via role="alert" and hides the list', () => {
    mockUseAtomGrants.mockReturnValue(grantsState({ grants: [], error: 'GRANTS-EXPLODED' }))
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('GRANTS-EXPLODED')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // The form stays available — a transient list failure must not block granting.
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
  })

  it('shows the empty state through the list when nothing is shared', () => {
    mockUseAtomGrants.mockReturnValue(grantsState({ grants: [] }))
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByText('Not shared with anyone yet.')).toBeInTheDocument()
  })

  it('renders success feedback as a status strip', () => {
    mockUseShareActions.mockReturnValue(actionsState({ feedback: { kind: 'success', message: 'Shared with carol.' } }))
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Shared with carol.')
  })

  it('renders error feedback as an alert strip', () => {
    mockUseShareActions.mockReturnValue(actionsState({
      feedback: { kind: 'error', message: 'No matching user or workspace was found.' },
    }))
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No matching user or workspace was found.')
  })

  it('pending disables both the revoke affordance and the Share submit', () => {
    mockUseShareActions.mockReturnValue(actionsState({ pending: true }))
    render(<ShareTab atom={makeAtom()} />)

    expect(screen.getByRole('button', { name: 'Revoke access for bob' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })
})
