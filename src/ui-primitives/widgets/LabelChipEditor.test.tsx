import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LabelChipEditor } from './LabelChipEditor'

describe('LabelChipEditor', () => {
  it('renders a removable chip per label', () => {
    render(<LabelChipEditor labels={['Project', 'Task']} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Task' })).toBeInTheDocument()
  })

  it('removing a chip fires onRemove with the label', async () => {
    const onRemove = vi.fn()
    render(<LabelChipEditor labels={['Project']} onAdd={vi.fn()} onRemove={onRemove} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Project' }))
    expect(onRemove).toHaveBeenCalledWith('Project')
  })

  it('committing the input on Enter fires onAdd and clears the draft', async () => {
    const onAdd = vi.fn()
    render(<LabelChipEditor labels={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Add label' })
    await userEvent.type(input, 'Urgent{Enter}')
    expect(onAdd).toHaveBeenCalledWith('Urgent')
    expect(input).toHaveValue('')
  })

  it('does not add a label that is already present', async () => {
    const onAdd = vi.fn()
    render(<LabelChipEditor labels={['Project']} onAdd={onAdd} onRemove={vi.fn()} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Add label' }), 'Project{Enter}')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does not add an empty/whitespace draft on Enter', async () => {
    const onAdd = vi.fn()
    render(<LabelChipEditor labels={[]} onAdd={onAdd} onRemove={vi.fn()} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Add label' }), '   {Enter}')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('applies the per-chip style seam to each chip (ADR-260063)', () => {
    render(
      <LabelChipEditor
        labels={['Project']}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        chipStyle={(label) => (label === 'Project' ? { background: 'var(--label-chip-1)' } : undefined)}
      />,
    )
    expect(screen.getByText('Project')).toHaveStyle({ background: 'var(--label-chip-1)' })
  })

  it('renders autocomplete suggestions as datalist options', () => {
    const { container } = render(<LabelChipEditor labels={[]} suggestions={['Alpha', 'Beta']} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(container.querySelectorAll('datalist option')).toHaveLength(2)
    expect(container.querySelector('datalist option[value="Alpha"]')).not.toBeNull()
  })
})

describe('LabelChipEditor draft reporting', () => {
  it('reports uncommitted input text to the caller', async () => {
    const onDraftChange = vi.fn()
    const user = userEvent.setup()
    render(
      <LabelChipEditor labels={[]} onAdd={vi.fn()} onRemove={vi.fn()} onDraftChange={onDraftChange} />,
    )

    await user.type(screen.getByLabelText('Add label'), 'Pro')

    expect(onDraftChange).toHaveBeenLastCalledWith('Pro')
  })

  it('clears the reported draft once the chip is committed', async () => {
    const onDraftChange = vi.fn()
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(
      <LabelChipEditor labels={[]} onAdd={onAdd} onRemove={vi.fn()} onDraftChange={onDraftChange} />,
    )

    await user.type(screen.getByLabelText('Add label'), 'Project{Enter}')

    expect(onAdd).toHaveBeenCalledWith('Project')
    expect(onDraftChange).toHaveBeenLastCalledWith('')
  })

  it('works without the optional callback', async () => {
    const user = userEvent.setup()
    render(<LabelChipEditor labels={[]} onAdd={vi.fn()} onRemove={vi.fn()} />)

    await user.type(screen.getByLabelText('Add label'), 'Project')

    expect(screen.getByLabelText('Add label')).toHaveValue('Project')
  })
})
