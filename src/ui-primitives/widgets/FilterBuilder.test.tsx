import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBuilder } from './FilterBuilder'
import type { WorkspaceFilter } from './widgets.types'

const EMPTY: WorkspaceFilter = { labels: [], categories: [] }

describe('FilterBuilder', () => {
  it('renders the current label chips and the injected category-facet slot', () => {
    render(
      <FilterBuilder
        filter={{ labels: ['Project'], categories: [] }}
        onChange={vi.fn()}
        categoryFacets={<div data-testid="facet-picker" />}
      />,
    )
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByTestId('facet-picker')).toBeInTheDocument()
  })

  it('adding a label produces an updated WorkspaceFilter via onChange', async () => {
    const onChange = vi.fn()
    render(<FilterBuilder filter={EMPTY} onChange={onChange} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Add label' }), 'Urgent{Enter}')
    expect(onChange).toHaveBeenCalledWith({ labels: ['Urgent'], categories: [] })
  })

  it('removing a label produces an updated WorkspaceFilter via onChange', async () => {
    const onChange = vi.fn()
    render(<FilterBuilder filter={{ labels: ['Project'], categories: [] }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove Project' }))
    expect(onChange).toHaveBeenCalledWith({ labels: [], categories: [] })
  })
})
