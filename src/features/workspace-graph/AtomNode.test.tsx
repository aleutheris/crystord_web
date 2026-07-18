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

describe('AtomNode compute-status badge (ADR-260065 / EPIC-260069)', () => {
  it.each([
    ['ok', 'Up to date', '✓ OK'],
    ['error', 'Division by zero', '⚠ Error'],
    ['skipped', 'Skipped — optional input absent', '⏭ Skipped'],
  ])('renders the %s badge with glyph + text and the summary as title/aria-label', (kind, summary, label) => {
    const { container } = render(
      <AtomNode {...makeProps({ title: 'Alpha', labels: [], computeStatus: { kind, summary } })} />,
    )
    const region = container.querySelector('[data-node-region="badges"]')!
    expect(region).not.toBeNull()
    // Never color alone: glyph + short text, summary spelled out for AT and hover.
    expect(region.textContent).toContain(label)
    expect(screen.getByLabelText(summary)).toBeInTheDocument()
    expect(screen.getByTitle(summary)).toBeInTheDocument()
  })

  it.each([
    ['a non-status string', 'ok'],
    ['a null value', null],
    ['an unknown kind', { kind: 'meh', summary: 'x' }],
    ['a missing summary', { kind: 'ok' }],
  ])('keeps the region an empty seam for %s', (_label, computeStatus) => {
    const { container } = render(
      <AtomNode {...makeProps({ title: 'Alpha', labels: [], computeStatus })} />,
    )
    const region = container.querySelector('[data-node-region="badges"]')!
    expect(region).not.toBeNull()
    expect(region.textContent).toBe('')
  })
})
