import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspacePanel } from './WorkspacePanel'
import {
  LIST_MY_WORKSPACES_QUERY,
  CREATE_WORKSPACE_MUTATION,
  UPDATE_WORKSPACE_MUTATION,
  DISSOLVE_WORKSPACE_MUTATION,
  ADD_WORKSPACE_MEMBER_MUTATION,
  REMOVE_WORKSPACE_MEMBER_MUTATION,
  UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
} from '../../api-contract/workspace-operations'

const mockQuery = vi.fn()
const mockMutate = vi.fn()
const mockClient = { query: mockQuery, mutate: mockMutate }

vi.mock('@apollo/client/react', () => ({
  useApolloClient: () => mockClient,
}))

const TEAM_A = {
  uuid: 'ws-1', key: 'team-a', name: 'Team A', description: null,
  createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', memberCount: 2,
}
const TEAM_B = {
  uuid: 'ws-2', key: 'team-b', name: 'Team B', description: 'Second team',
  createdAt: '2026-07-02T00:00:00Z', updatedAt: '2026-07-02T00:00:00Z', memberCount: 1,
}
const SELF_ADMIN = { userUuid: 'u-1', username: 'demo.user', email: 'demo@crystord.test', role: 'ADMIN', joinedAt: '2026-07-01T00:00:00Z' }
const OTHER_VIEWER = { userUuid: 'u-2', username: 'ada', email: 'ada@crystord.test', role: 'VIEWER', joinedAt: '2026-07-02T00:00:00Z' }

beforeEach(() => {
  mockQuery.mockReset()
  mockMutate.mockReset()
  mockQuery.mockImplementation(({ query }: { query: unknown }) => {
    if (query === LIST_MY_WORKSPACES_QUERY) {
      return Promise.resolve({ data: { listMyWorkspaces: [TEAM_A, TEAM_B] } })
    }
    return Promise.resolve({ data: { listWorkspaceMembers: [SELF_ADMIN, OTHER_VIEWER] } })
  })
  mockMutate.mockResolvedValue({ data: {} })
})

async function renderPanel(selfUsername: string | undefined = 'demo.user') {
  const onClose = vi.fn()
  render(<WorkspacePanel onClose={onClose} selfUsername={selfUsername} />)
  await waitFor(() => expect(screen.queryByText('Loading workspaces…')).not.toBeInTheDocument())
  return onClose
}

async function selectTeamA() {
  await userEvent.click(screen.getByRole('button', { name: /Team A/ }))
  await waitFor(() => expect(screen.queryByText('Loading members…')).not.toBeInTheDocument())
}

describe('WorkspacePanel dialog + list', () => {
  it('renders an accessible modal listing workspaces with key and member count', async () => {
    await renderPanel()
    expect(screen.getByRole('dialog', { name: 'Workspaces' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('team-a · 2 members')).toBeInTheDocument()
    // Singular member count
    expect(screen.getByText('team-b · 1 member')).toBeInTheDocument()
    expect(screen.getByText(/select a workspace/i)).toBeInTheDocument()
  })

  it('shows an empty-list message when the caller has no workspaces', async () => {
    mockQuery.mockResolvedValue({ data: { listMyWorkspaces: [] } })
    await renderPanel()
    expect(screen.getByText('No workspaces yet.')).toBeInTheDocument()
  })

  it('surfaces a list load failure as an alert', async () => {
    mockQuery.mockRejectedValue(new Error('kaboom'))
    await renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your workspaces.')
  })

  it('closes via the close button and the backdrop', async () => {
    const onClose = await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Close workspaces' }))
    await userEvent.click(document.querySelector('[aria-hidden="true"]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('WorkspacePanel create flow', () => {
  it('creates a workspace from the inline form and collapses it on success', async () => {
    await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    await userEvent.type(screen.getByLabelText('Key'), 'team-c')
    await userEvent.type(screen.getByLabelText('Name'), 'Team C')
    await userEvent.type(screen.getByLabelText('Description'), 'Third team')
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({
      mutation: CREATE_WORKSPACE_MUTATION,
      variables: { key: 'team-c', name: 'Team C', description: 'Third team' },
    }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'New workspace' })).toBeInTheDocument())
  })

  it('does not submit a whitespace-only key or name', async () => {
    await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    await userEvent.type(screen.getByLabelText('Key'), ' ')
    await userEvent.type(screen.getByLabelText('Name'), 'Team C')
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(mockMutate).not.toHaveBeenCalled()

    await userEvent.clear(screen.getByLabelText('Key'))
    await userEvent.type(screen.getByLabelText('Key'), 'team-c')
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), ' ')
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('keeps the form open when creation fails and shows the error', async () => {
    mockMutate.mockRejectedValue(new Error('WS-KEY-EXISTS'))
    await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    await userEvent.type(screen.getByLabelText('Key'), 'team-a')
    await userEvent.type(screen.getByLabelText('Name'), 'Dup')
    await userEvent.click(screen.getByRole('button', { name: 'Create workspace' }))
    // Raw fallback for an unrecognized code (ADR-260066)
    expect(await screen.findByRole('alert')).toHaveTextContent('WS-KEY-EXISTS')
    expect(screen.getByLabelText('Key')).toBeInTheDocument()
  })

  it('cancel collapses the form without creating', async () => {
    await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'New workspace' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Key')).not.toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('WorkspacePanel detail + rename', () => {
  it('selecting a workspace shows its detail with prefilled name/description', async () => {
    await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /Team B/ }))
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Team B'))
    expect(screen.getByLabelText('Description')).toHaveValue('Second team')
    expect(screen.getByText('Key: team-b')).toBeInTheDocument()
  })

  it('null description prefills as empty', async () => {
    await renderPanel()
    await selectTeamA()
    expect(screen.getByLabelText('Description')).toHaveValue('')
  })

  it('saving details fires the update mutation with trimmed values', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Team Alpha ')
    await userEvent.type(screen.getByLabelText('Description'), 'First team')
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({
      mutation: UPDATE_WORKSPACE_MUTATION,
      variables: { uuid: 'ws-1', name: 'Team Alpha', description: 'First team' },
    }))
  })

  it('does not save a whitespace-only name', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), ' ')
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('WorkspacePanel members management (admin)', () => {
  it('lists members with username, email, and a role select per member', async () => {
    await renderPanel()
    await selectTeamA()
    expect(screen.getByText('ada')).toBeInTheDocument()
    expect(screen.getByText('ada@crystord.test')).toBeInTheDocument()
    expect(screen.getByLabelText('Role for ada')).toHaveValue('VIEWER')
  })

  it('changing a role fires the role mutation', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.selectOptions(screen.getByLabelText('Role for ada'), 'EDITOR')
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({
      mutation: UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
      variables: { workspaceUuid: 'ws-1', username: 'ada', role: 'EDITOR' },
    }))
  })

  it('removal is a two-step inline confirm', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ada' }))
    expect(mockMutate).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove' }))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({
      mutation: REMOVE_WORKSPACE_MEMBER_MUTATION,
      variables: { workspaceUuid: 'ws-1', username: 'ada' },
    }))
  })

  it('removal confirm can be cancelled', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.click(screen.getByRole('button', { name: 'Remove ada' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Remove ada' })).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('adds a member by username with the chosen role and clears the row', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.type(screen.getByLabelText('Add member by username'), 'grace')
    await userEvent.selectOptions(screen.getByLabelText('New member role'), 'EDITOR')
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({
      mutation: ADD_WORKSPACE_MEMBER_MUTATION,
      variables: { workspaceUuid: 'ws-1', username: 'grace', role: 'EDITOR' },
    }))
    await waitFor(() => expect(screen.getByLabelText('Add member by username')).toHaveValue(''))
  })

  it('does not add a whitespace-only username', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.type(screen.getByLabelText('Add member by username'), ' ')
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('surfaces a member-mutation failure (unknown username, CR-16) as an alert', async () => {
    mockMutate.mockRejectedValue(new Error('CR-16-PRINCIPAL-UNKNOWN'))
    await renderPanel()
    await selectTeamA()
    await userEvent.type(screen.getByLabelText('Add member by username'), 'ghost')
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no matching user or workspace/i)
  })

  it('surfaces a member-list load failure as an alert', async () => {
    mockQuery.mockImplementation(({ query }: { query: unknown }) => {
      if (query === LIST_MY_WORKSPACES_QUERY) {
        return Promise.resolve({ data: { listMyWorkspaces: [TEAM_A] } })
      }
      return Promise.reject(new Error('kaboom'))
    })
    await renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /Team A/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the member list.')
  })
})

describe('WorkspacePanel soft-gating (non-admin)', () => {
  it('hides member mutations and dissolve for a non-admin caller', async () => {
    await renderPanel('ada')
    await selectTeamA()
    expect(screen.getByText('VIEWER')).toBeInTheDocument()
    expect(screen.queryByLabelText('Role for ada')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add member by username')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dissolve/i })).not.toBeInTheDocument()
  })

  it('treats an unknown caller (no username yet) as non-admin', async () => {
    render(<WorkspacePanel onClose={vi.fn()} />)
    await waitFor(() => expect(screen.queryByText('Loading workspaces…')).not.toBeInTheDocument())
    await selectTeamA()
    expect(screen.queryByRole('button', { name: /dissolve/i })).not.toBeInTheDocument()
  })
})

describe('WorkspacePanel dissolve (two-step)', () => {
  it('requires an explicit confirm, then dissolves and clears the selection', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.click(screen.getByRole('button', { name: 'Dissolve workspace…' }))
    expect(mockMutate).not.toHaveBeenCalled()
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Yes, dissolve workspace' }))
    await waitFor(() => expect(mockMutate).toHaveBeenCalledWith({
      mutation: DISSOLVE_WORKSPACE_MUTATION,
      variables: { uuid: 'ws-1' },
    }))
    await waitFor(() => expect(screen.getByText(/select a workspace/i)).toBeInTheDocument())
  })

  it('the first step can be cancelled', async () => {
    await renderPanel()
    await selectTeamA()
    await userEvent.click(screen.getByRole('button', { name: 'Dissolve workspace…' }))
    await userEvent.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1) as HTMLElement)
    expect(screen.getByRole('button', { name: 'Dissolve workspace…' })).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('keeps the selection and surfaces the error when dissolving fails', async () => {
    mockMutate.mockRejectedValue(new Error('CR-15-WORKSPACE-ADMIN-EXISTS'))
    await renderPanel()
    await selectTeamA()
    await userEvent.click(screen.getByRole('button', { name: 'Dissolve workspace…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, dissolve workspace' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/sole admin/i)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
