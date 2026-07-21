import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddDimensionForm } from './AddDimensionForm'
import type { DimensionOutlineEntry } from './category-tree'

const PARENT_OPTIONS: DimensionOutlineEntry[] = [
  { key: 'region', displayName: 'Region', depth: 0 },
  { key: 'period', displayName: 'Period', depth: 0 },
]

describe('AddDimensionForm parent selector (ADR-260071)', () => {
  it('hides the selector when no dimension can be a parent — the first-dimension case', () => {
    render(<AddDimensionForm onSubmit={vi.fn()} />)
    expect(screen.queryByLabelText('Parent dimension')).not.toBeInTheDocument()
  })

  it('offers every candidate parent and defaults to creating a root dimension', () => {
    render(<AddDimensionForm onSubmit={vi.fn()} parentOptions={PARENT_OPTIONS} />)
    const select = screen.getByLabelText('Parent dimension')
    expect(select).toHaveValue('')
    expect(select).toHaveDisplayValue('No parent (top level)')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'No parent (top level)', 'Region', 'Period',
    ])
  })
})

describe('AddDimensionForm submit', () => {
  it('passes null as the parent when the top-level default is left untouched', async () => {
    const onSubmit = vi.fn()
    render(<AddDimensionForm onSubmit={onSubmit} parentOptions={PARENT_OPTIONS} />)
    await userEvent.type(screen.getByLabelText('New dimension key'), 'country')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Country')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(onSubmit).toHaveBeenCalledWith('country', 'Country', null)
  })

  it('passes the selected parent key so the create is atomic (no intermediate root state)', async () => {
    const onSubmit = vi.fn()
    render(<AddDimensionForm onSubmit={onSubmit} parentOptions={PARENT_OPTIONS} />)
    await userEvent.type(screen.getByLabelText('New dimension key'), 'country')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Country')
    await userEvent.selectOptions(screen.getByLabelText('Parent dimension'), 'region')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(onSubmit).toHaveBeenCalledWith('country', 'Country', 'region')
  })

  it('trims the key and display name before submitting', async () => {
    const onSubmit = vi.fn()
    render(<AddDimensionForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText('New dimension key'), '  country  ')
    await userEvent.type(screen.getByLabelText('New dimension name'), '  Country  ')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))
    expect(onSubmit).toHaveBeenCalledWith('country', 'Country', null)
  })

  it('ignores submits where the key or the name is blank after trimming', async () => {
    const onSubmit = vi.fn()
    render(<AddDimensionForm onSubmit={onSubmit} parentOptions={PARENT_OPTIONS} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))

    // Whitespace-only entries must not reach the API as an empty key.
    await userEvent.type(screen.getByLabelText('New dimension key'), '   ')
    await userEvent.type(screen.getByLabelText('New dimension name'), 'Country')
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))

    await userEvent.clear(screen.getByLabelText('New dimension key'))
    await userEvent.type(screen.getByLabelText('New dimension key'), 'country')
    await userEvent.clear(screen.getByLabelText('New dimension name'))
    await userEvent.click(screen.getByRole('button', { name: 'Create dimension' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
