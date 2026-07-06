import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoryTree } from './CategoryTree'
import type { CategoryTreeNode } from './widgets.types'

const NODES: CategoryTreeNode[] = [
  {
    key: 'region',
    displayName: 'Region',
    atomCount: 5,
    children: [{ key: 'region/be', displayName: 'Belgium', atomCount: 2 }],
  },
  { key: 'status', displayName: 'Status', atomCount: 3 },
]

describe('CategoryTree', () => {
  it('renders node display names and counts, children hidden when collapsed', () => {
    render(<CategoryTree nodes={NODES} expandedKeys={[]} onToggle={vi.fn()} />)
    expect(screen.getByText('Region')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.queryByText('Belgium')).not.toBeInTheDocument()
  })

  it('toggling fires onToggle with the node key', async () => {
    const onToggle = vi.fn()
    render(<CategoryTree nodes={NODES} expandedKeys={[]} onToggle={onToggle} />)
    await userEvent.click(screen.getByRole('button', { name: 'Expand Region' }))
    expect(onToggle).toHaveBeenCalledWith('region')
  })

  it('renders children when the node is expanded', () => {
    render(<CategoryTree nodes={NODES} expandedKeys={['region']} onToggle={vi.fn()} />)
    expect(screen.getByText('Belgium')).toBeInTheDocument()
  })

  it('selecting a node fires onSelect with the node', async () => {
    const onSelect = vi.fn()
    render(<CategoryTree nodes={NODES} expandedKeys={[]} onToggle={vi.fn()} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Status'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'status' }))
  })

  it('shows edit affordances only where canEditNode allows and onEditNode is provided (Q2 seam)', () => {
    render(
      <CategoryTree
        nodes={NODES}
        expandedKeys={[]}
        onToggle={vi.fn()}
        canEditNode={(n) => n.key === 'status'}
        onEditNode={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Edit Status' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Region' })).not.toBeInTheDocument()
  })

  it('clicking the edit affordance fires onEditNode with the node', async () => {
    const onEditNode = vi.fn()
    render(<CategoryTree nodes={NODES} expandedKeys={[]} onToggle={vi.fn()} canEditNode={() => true} onEditNode={onEditNode} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit Status' }))
    expect(onEditNode).toHaveBeenCalledWith(expect.objectContaining({ key: 'status' }))
  })
})
