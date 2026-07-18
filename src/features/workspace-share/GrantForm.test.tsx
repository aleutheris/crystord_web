import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GrantForm } from './GrantForm'

describe('GrantForm — fields (ADR-260069)', () => {
  it('labels the principal input by the selected type: Username for USER, Workspace key for WORKSPACE', async () => {
    render(<GrantForm pending={false} onShare={vi.fn(async () => true)} />)

    // USER is the default type.
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByLabelText('Workspace key')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Principal type'), 'WORKSPACE')

    expect(screen.getByLabelText('Workspace key')).toBeInTheDocument()
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
  })

  it('offers only the grantable levels — Editor and Viewer, no Owner', () => {
    render(<GrantForm pending={false} onShare={vi.fn(async () => true)} />)

    const level = screen.getByLabelText('Access level')
    const options = Array.from(level.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toEqual(['Editor', 'Viewer'])
  })

  it('disables Share while the principal is empty or blank', async () => {
    render(<GrantForm pending={false} onShare={vi.fn(async () => true)} />)

    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Username'), '   ')
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Username'), 'bob')
    expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled()
  })

  it('disables Share while a mutation is pending', () => {
    const { rerender } = render(<GrantForm pending={false} onShare={vi.fn(async () => true)} />)
    rerender(<GrantForm pending={true} onShare={vi.fn(async () => true)} />)

    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })
})

describe('GrantForm — submission (ADR-260069)', () => {
  it('submits the trimmed principal with the selected type and level, then resets the input', async () => {
    const onShare = vi.fn(async () => true)
    render(<GrantForm pending={false} onShare={onShare} />)

    await userEvent.type(screen.getByLabelText('Username'), '  bob  ')
    await userEvent.selectOptions(screen.getByLabelText('Access level'), 'EDITOR')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(onShare).toHaveBeenCalledOnce()
    expect(onShare).toHaveBeenCalledWith('bob', 'USER', 'EDITOR')
    // Success clears the principal for the next grant; the selects keep their choices.
    expect(screen.getByLabelText('Username')).toHaveValue('')
    expect(screen.getByLabelText('Access level')).toHaveValue('EDITOR')
  })

  it('shares to a workspace by key when the WORKSPACE type is selected', async () => {
    const onShare = vi.fn(async () => true)
    render(<GrantForm pending={false} onShare={onShare} />)

    await userEvent.selectOptions(screen.getByLabelText('Principal type'), 'WORKSPACE')
    await userEvent.type(screen.getByLabelText('Workspace key'), 'team-a')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(onShare).toHaveBeenCalledWith('team-a', 'WORKSPACE', 'VIEWER')
  })

  it('keeps the principal for correction when sharing fails', async () => {
    const onShare = vi.fn(async () => false)
    render(<GrantForm pending={false} onShare={onShare} />)

    await userEvent.type(screen.getByLabelText('Username'), 'typo-name')
    await userEvent.click(screen.getByRole('button', { name: 'Share' }))

    expect(onShare).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Username')).toHaveValue('typo-name')
  })
})
