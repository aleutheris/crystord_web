import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FacetChips } from './FacetChips'
import type { CategoryFacetFilter } from '../ui-primitives'

const FACETS: CategoryFacetFilter[] = [
  { dimensionKey: 'region', valueKeys: ['europe', 'asia'], includeDescendants: true },
  { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
]

describe('FacetChips', () => {
  it('renders nothing when there are no facets', () => {
    const { container } = render(<FacetChips facets={[]} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one Dimension ▸ Value chip per pair', () => {
    render(<FacetChips facets={FACETS} onChange={vi.fn()} />)
    const group = screen.getByRole('group', { name: 'Category filters' })
    expect(group).toHaveTextContent('region ▸ europe')
    expect(group).toHaveTextContent('region ▸ asia')
    expect(group).toHaveTextContent('period ▸ q1')
  })

  it('removing a chip drops just that value from its dimension entry', async () => {
    const onChange = vi.fn()
    render(<FacetChips facets={FACETS} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter region ▸ europe' }))
    expect(onChange).toHaveBeenCalledWith([
      { dimensionKey: 'region', valueKeys: ['asia'], includeDescendants: true },
      { dimensionKey: 'period', valueKeys: ['q1'], includeDescendants: false },
    ])
  })

  it('removing the last value of a dimension drops the whole entry', async () => {
    const onChange = vi.fn()
    render(<FacetChips facets={FACETS} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove filter period ▸ q1' }))
    expect(onChange).toHaveBeenCalledWith([
      { dimensionKey: 'region', valueKeys: ['europe', 'asia'], includeDescendants: true },
    ])
  })
})
