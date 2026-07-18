import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrantList } from './GrantList'
import type { GrantRow } from './GrantList'

function makeGrant(overrides?: Partial<GrantRow>): GrantRow {
  return {
    principalUuid: 'uuid-bob',
    principalType: 'USER',
    principalName: 'bob',
    level: 'EDITOR',
    grantedAt: '2026-07-01T10:00:00Z',
    ...overrides,
  }
}

describe('GrantList — rendering (ADR-260069)', () => {
  it('renders one row per grant: principal, type, level, localized grantedAt', () => {
    render(
      <GrantList
        grants={[
          makeGrant(),
          makeGrant({ principalUuid: 'uuid-team-a', principalType: 'WORKSPACE', principalName: 'team-a', level: 'VIEWER' }),
        ]}
        pending={false}
        onRevoke={vi.fn()}
      />,
    )

    const table = screen.getByRole('table', { name: 'Access grants' })
    expect(table).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByText('USER')).toBeInTheDocument()
    expect(screen.getByText('EDITOR')).toBeInTheDocument()
    expect(screen.getByText('team-a')).toBeInTheDocument()
    expect(screen.getByText('WORKSPACE')).toBeInTheDocument()
    expect(screen.getByText('VIEWER')).toBeInTheDocument()
    // Localized grant timestamps (one per row).
    expect(screen.getAllByText(new Date('2026-07-01T10:00:00Z').toLocaleString())).toHaveLength(2)
  })

  it('shows the empty state when nothing is shared', () => {
    render(<GrantList grants={[]} pending={false} onRevoke={vi.fn()} />)

    expect(screen.getByText('Not shared with anyone yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('GrantList — two-step revoke confirm (ADR-260069)', () => {
  it('Revoke opens the per-row confirm group; Confirm calls onRevoke with the principal', async () => {
    const onRevoke = vi.fn()
    render(
      <GrantList
        grants={[makeGrant(), makeGrant({ principalUuid: 'uuid-carol', principalName: 'carol' })]}
        pending={false}
        onRevoke={onRevoke}
      />,
    )

    // No first-click revocation: the mutation fires only from the confirm step.
    await userEvent.click(screen.getByRole('button', { name: 'Revoke access for bob' }))
    expect(onRevoke).not.toHaveBeenCalled()

    const group = screen.getByRole('group', { name: 'Confirm revoke for bob' })
    expect(group).toBeInTheDocument()
    // Only the clicked row entered confirm mode.
    expect(screen.getByRole('button', { name: 'Revoke access for carol' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))
    expect(onRevoke).toHaveBeenCalledOnce()
    expect(onRevoke).toHaveBeenCalledWith('bob', 'USER')
    // The confirm group collapses back to the plain affordance.
    expect(screen.queryByRole('group', { name: 'Confirm revoke for bob' })).not.toBeInTheDocument()
  })

  it('passes the WORKSPACE principal type through to onRevoke', async () => {
    const onRevoke = vi.fn()
    render(
      <GrantList
        grants={[makeGrant({ principalUuid: 'uuid-team-a', principalType: 'WORKSPACE', principalName: 'team-a' })]}
        pending={false}
        onRevoke={onRevoke}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Revoke access for team-a' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))
    expect(onRevoke).toHaveBeenCalledOnce()
    expect(onRevoke).toHaveBeenCalledWith('team-a', 'WORKSPACE')
  })

  it('Cancel collapses the confirm step without revoking', async () => {
    const onRevoke = vi.fn()
    render(<GrantList grants={[makeGrant()]} pending={false} onRevoke={onRevoke} />)

    await userEvent.click(screen.getByRole('button', { name: 'Revoke access for bob' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onRevoke).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Confirm revoke for bob' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoke access for bob' })).toBeInTheDocument()
  })

  it('disables the revoke affordances while a mutation is pending', async () => {
    const { rerender } = render(<GrantList grants={[makeGrant()]} pending={false} onRevoke={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Revoke access for bob' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Revoke access for bob' }))
    rerender(<GrantList grants={[makeGrant()]} pending={true} onRevoke={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Confirm revoke' })).toBeDisabled()
  })
})
