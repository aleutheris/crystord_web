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

  it('renders autocomplete suggestions as datalist options', () => {
    const { container } = render(<LabelChipEditor labels={[]} suggestions={['Alpha', 'Beta']} onAdd={vi.fn()} onRemove={vi.fn()} />)
    expect(container.querySelectorAll('datalist option')).toHaveLength(2)
    expect(container.querySelector('datalist option[value="Alpha"]')).not.toBeNull()
  })
})
