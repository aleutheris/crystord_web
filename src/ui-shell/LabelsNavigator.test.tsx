import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LabelsNavigator } from './LabelsNavigator'
import type { Atom } from '../api-contract'

function atom(uuid: string, labels: string[]): Atom {
  return { labels, properties: { shellies: { uuid }, nuclearies: { title: uuid } } } as unknown as Atom
}

describe('LabelsNavigator', () => {
  it('lists distinct labels from the working set with counts', () => {
    const atoms = [atom('a1', ['Project', 'Active']), atom('a2', ['Project']), atom('a3', ['Task'])]
    render(<LabelsNavigator atoms={atoms} />)
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    // Project appears on two atoms
    const projectRow = screen.getByText('Project').closest('li')
    expect(projectRow).toHaveTextContent('2')
  })

  it('shows an empty state when the working set has no labels', () => {
    render(<LabelsNavigator atoms={[]} />)
    expect(screen.getByText(/no labels/i)).toBeInTheDocument()
  })

  it('tolerates atoms without a labels array (defensive)', () => {
    const noLabels = { properties: { shellies: { uuid: 'x' }, nuclearies: { title: 'x' } } } as unknown as Atom
    render(<LabelsNavigator atoms={[noLabels]} />)
    expect(screen.getByText(/no labels/i)).toBeInTheDocument()
  })
})
