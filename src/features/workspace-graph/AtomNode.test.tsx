import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AtomNode } from './AtomNode'

vi.mock('@xyflow/react', () => ({
  Handle: ({ type }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-handle-type={type} />
  ),
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
}))

function makeProps(data: Record<string, unknown>, selected = false) {
  return {
    id: 'test-node',
    data,
    selected,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 0,
    isConnectable: true,
    type: 'atom',
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  }
}

describe('AtomNode', () => {
  it('renders the title and labels', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'] })} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Tag')).toBeInTheDocument()
  })

  it('always renders the target (drop) handle', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: [] })} />)
    expect(screen.getByTestId('handle-target')).toBeInTheDocument()
  })

  it('renders the source (bond-create) handle when the atom is bondable', () => {
    render(<AtomNode {...makeProps({ title: 'Beta', labels: [], canBond: true })} />)
    expect(screen.getByTestId('handle-source')).toBeInTheDocument()
  })

  it('hides the source handle when the atom is not bondable (read-side gating)', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: [], canBond: false })} />)
    expect(screen.queryByTestId('handle-source')).not.toBeInTheDocument()
    expect(screen.getByTestId('handle-target')).toBeInTheDocument()
  })

  it('hides the source handle when bondability is unspecified (fail-closed default)', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: [] })} />)
    expect(screen.queryByTestId('handle-source')).not.toBeInTheDocument()
  })

  it('renders selected and non-flow styling variants', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'], isNonFlowAtom: true }, true)} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('keeps the badges region empty by default — no behavior change (no computeStatus)', () => {
    const { container } = render(<AtomNode {...makeProps({ title: 'Alpha', labels: [] })} />)
    expect(container.querySelector('[data-node-region="badges"]')).toBeNull()
  })

  it('exposes the badges-region seam when computeStatus is present (EPIC-260069 fills it)', () => {
    const { container } = render(<AtomNode {...makeProps({ title: 'Alpha', labels: [], computeStatus: 'ok' })} />)
    expect(container.querySelector('[data-node-region="badges"]')).not.toBeNull()
  })
})
