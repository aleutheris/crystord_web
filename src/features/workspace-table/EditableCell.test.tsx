import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditableCell } from './EditableCell'

describe('EditableCell (EPIC-260071 T3)', () => {
  it('renders the value as an edit button and swaps to an input on click', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Edit title of Alpha' })
    expect(button).toHaveTextContent('Alpha')

    await user.click(button)
    const input = screen.getByLabelText('Edit title of Alpha')
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveValue('Alpha')
  })

  it('renders a textarea when multiline', async () => {
    const user = userEvent.setup()
    render(<EditableCell value="Body" fieldLabel="content of Alpha" multiline onCommit={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Edit content of Alpha' }))
    expect(screen.getByLabelText('Edit content of Alpha').tagName).toBe('TEXTAREA')
  })

  it('commits the edited draft on Enter and returns to display mode', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    const input = screen.getByLabelText('Edit title of Alpha')
    await user.clear(input)
    await user.type(input, 'Alpha II')
    await user.keyboard('{Enter}')

    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCommit).toHaveBeenCalledWith('Alpha II')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument())
  })

  it('cancels on Escape without committing', async () => {
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    await user.type(screen.getByLabelText('Edit title of Alpha'), ' draft')
    await user.keyboard('{Escape}')

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument()
  })

  it('cancels on blur without committing', async () => {
    const onCommit = vi.fn()
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    fireEvent.blur(screen.getByLabelText('Edit title of Alpha'))

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument()
  })

  it('disables the editor while saving and ignores the disable-triggered blur', async () => {
    let resolveCommit!: () => void
    const onCommit = vi.fn(() => new Promise<void>((resolve) => { resolveCommit = resolve }))
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    await user.keyboard('{Enter}')

    const input = screen.getByLabelText('Edit title of Alpha')
    expect(input).toBeDisabled()
    // Disabling a focused editor fires blur — that must not cancel the in-flight save.
    fireEvent.blur(input)
    expect(screen.getByLabelText('Edit title of Alpha')).toBeInTheDocument()

    resolveCommit()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument())
  })

  it('stays in edit mode when the commit rejects, so the user can retry', async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error('denied'))
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.getByLabelText('Edit title of Alpha')).toBeEnabled())
    expect(screen.getByLabelText('Edit title of Alpha').tagName).toBe('INPUT')
  })

  it('multiline: plain Enter stays a newline — only Ctrl+Enter (or Cmd+Enter) commits', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<EditableCell value="Body" fieldLabel="content of Alpha" multiline onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit content of Alpha' }))
    await user.keyboard('{Enter}')
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Edit content of Alpha')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByLabelText('Edit content of Alpha'), { key: 'Enter', metaKey: true })
    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce())

    await user.click(screen.getByRole('button', { name: 'Edit content of Alpha' }))
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(2))
  })

  it('required: refuses to commit an empty draft, then commits once text exists', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<EditableCell value="Alpha" fieldLabel="title of Alpha" required onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    const input = screen.getByLabelText('Edit title of Alpha')
    await user.clear(input)
    await user.keyboard('{Enter}')
    // Empty titles are forbidden on the established edit surface (DetailPanel required title).
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Edit title of Alpha')).toBeInTheDocument()

    await user.type(input, 'Alpha II')
    await user.keyboard('{Enter}')
    expect(onCommit).toHaveBeenCalledWith('Alpha II')
  })

  it('does not leak edit-start clicks or commit/cancel keys to ancestors', async () => {
    const onClick = vi.fn()
    const onKeyDown = vi.fn()
    const user = userEvent.setup()
    render(
      <div onClick={onClick} onKeyDown={onKeyDown}>
        <EditableCell value="Alpha" fieldLabel="title of Alpha" onCommit={vi.fn().mockResolvedValue(undefined)} />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    expect(onClick).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit title of Alpha' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Edit title of Alpha' }))
    await user.keyboard('{Escape}')
    expect(onKeyDown).not.toHaveBeenCalled()
  })
})
