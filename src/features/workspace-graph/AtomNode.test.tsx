import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AtomNode } from './AtomNode'

// Settable viewport zoom for the LOD fork (ADR-260067) — default 1 renders the block state.
const viewport = vi.hoisted(() => ({ zoom: 1 }))

vi.mock('@xyflow/react', () => ({
  Handle: ({ type }: { type: string; position: string }) => (
    <div data-testid={`handle-${type}`} data-handle-type={type} />
  ),
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  useStore: (selector: (s: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, viewport.zoom] }),
}))

beforeEach(() => {
  viewport.zoom = 1
})

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
  it('renders the title and the labels as classification dots (block state at default zoom)', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'] })} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Tag' })).toBeInTheDocument()
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

describe('AtomNode LOD fork (ADR-260067 / EPIC-260072 / REQ-FR-260075)', () => {
  it('renders the compact chip below the threshold: label dot + title, nothing else', () => {
    viewport.zoom = 0.5
    const { container } = render(
      <AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag', 'Num'], content: '5', operation: '{"name":"SUM"}' })} />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    // First label's palette dot, its text as tooltip/accessible name (REQ-CR-260011).
    expect(screen.getByRole('img', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.getByTitle('Tag')).toBeInTheDocument()
    // No labels line, no meta row, no dots row, no computed marker.
    expect(screen.queryByText('Tag')).not.toBeInTheDocument()
    expect(screen.queryByText('5')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Classification' })).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Computed atom' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-node-region="body"]')).not.toBeNull()
  })

  it('renders a neutral (non-palette) compact dot when the atom has no labels', () => {
    viewport.zoom = 0.5
    const { container } = render(<AtomNode {...makeProps({ title: 'Alpha', labels: [] })} />)
    const dot = container.querySelector('[data-node-region="body"] [aria-hidden="true"]')
    expect(dot).not.toBeNull()
    expect(dot!.getAttribute('style')).toContain('border-radius: 50%')
  })

  it('truncates a long title in the compact chip', () => {
    viewport.zoom = 0.5
    render(<AtomNode {...makeProps({ title: 'A'.repeat(30), labels: [] })} />)
    expect(screen.getByText(`${'A'.repeat(24)}…`)).toBeInTheDocument()
  })

  it('switches states exactly at the threshold (0.74 compact, 0.75 block)', () => {
    viewport.zoom = 0.74
    const first = render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'] })} />)
    expect(screen.queryByRole('group', { name: 'Classification' })).not.toBeInTheDocument()
    first.unmount()

    viewport.zoom = 0.75
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'] })} />)
    expect(screen.getByRole('group', { name: 'Classification' })).toBeInTheDocument()
  })

  it('shows the ƒ computed marker in the block header when operation is a non-empty string', () => {
    render(<AtomNode {...makeProps({ title: 'Total', labels: [], operation: '{"name":"SUM","args":[]}' })} />)
    const marker = screen.getByRole('img', { name: 'Computed atom' })
    expect(marker).toHaveTextContent('ƒ')
    expect(screen.getByTitle('Computed atom')).toBeInTheDocument()
  })

  it.each([
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('shows no computed marker when operation is %s', (_label, operation) => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: [], operation })} />)
    expect(screen.queryByRole('img', { name: 'Computed atom' })).not.toBeInTheDocument()
  })

  it('renders the monospace meta row with the truncated content value', () => {
    const { container } = render(
      <AtomNode {...makeProps({ title: 'Alpha', labels: [], content: '123456789012345678901234567890' })} />,
    )
    const value = screen.getByText('123456789012345678901234…')
    expect(value).toBeInTheDocument()
    expect(container.querySelector('[style*="monospace"]')).not.toBeNull()
  })

  it('renders the compute-status summary as meta-row text alongside the value', () => {
    render(
      <AtomNode
        {...makeProps({ title: 'Total', labels: [], content: '12', computeStatus: { kind: 'ok', summary: 'Up to date' } })}
      />,
    )
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Up to date')).toBeInTheDocument()
  })

  it('omits the meta row entirely when there is no value and no status', () => {
    const { container } = render(<AtomNode {...makeProps({ title: 'Alpha', labels: [], content: '' })} />)
    expect(container.querySelector('[style*="monospace"]')).toBeNull()
  })

  it('renders round label dots and square dots per distinct dimension key, each with its text', () => {
    render(
      <AtomNode
        {...makeProps({
          title: 'Alpha',
          labels: ['Tag'],
          categories: [
            { dimensionKey: 'region', valueKey: 'europe' },
            { dimensionKey: 'region', valueKey: 'asia' },
            { dimensionKey: 'stage', valueKey: 'draft' },
          ],
        })}
      />,
    )
    const group = screen.getByRole('group', { name: 'Classification' })
    const labelDot = screen.getByRole('img', { name: 'Tag' })
    expect(labelDot.getAttribute('style')).toContain('border-radius: 50%')
    expect(labelDot.getAttribute('title')).toBe('Tag')
    // One square dot per DISTINCT dimension key — 'region' appears once despite two values.
    expect(screen.getAllByRole('img', { name: 'region' })).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'region' }).getAttribute('style')).toContain('border-radius: 2px')
    expect(screen.getByRole('img', { name: 'stage' })).toBeInTheDocument()
    expect(group.querySelectorAll('[role="img"]')).toHaveLength(3)
  })

  it('caps the dots row with a "+N" overflow cell whose tooltip lists the hidden items', () => {
    render(
      <AtomNode {...makeProps({ title: 'Alpha', labels: ['A', 'B', 'C', 'D', 'E', 'F'] })} />,
    )
    const group = screen.getByRole('group', { name: 'Classification' })
    expect(group.querySelectorAll('[role="img"]')).toHaveLength(4)
    const overflow = screen.getByText('+2')
    expect(overflow.getAttribute('title')).toBe('E, F')
    expect(overflow.getAttribute('aria-label')).toBe('2 more: E, F')
  })

  it('omits the dots row for an unclassified atom', () => {
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: [] })} />)
    expect(screen.queryByRole('group', { name: 'Classification' })).not.toBeInTheDocument()
  })

  it('honors an explicit data.lod="compact" override at block zoom (the reserved seam)', () => {
    viewport.zoom = 1
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'], lod: 'compact' })} />)
    expect(screen.queryByRole('group', { name: 'Classification' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Tag' })).toBeInTheDocument()
  })

  it('honors an explicit data.lod="block" override at compact zoom', () => {
    viewport.zoom = 0.3
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'], lod: 'block' })} />)
    expect(screen.getByRole('group', { name: 'Classification' })).toBeInTheDocument()
  })

  it('ignores an unrecognized data.lod value and falls back to the zoom state', () => {
    viewport.zoom = 0.3
    render(<AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'], lod: 'weird' })} />)
    expect(screen.queryByRole('group', { name: 'Classification' })).not.toBeInTheDocument()
  })

  it.each([
    ['compact', 0.5],
    ['block', 1],
  ])('preserves selected weight and non-flow dimming in the %s state', (_state, zoom) => {
    viewport.zoom = zoom
    render(
      <AtomNode {...makeProps({ title: 'Alpha', labels: ['Tag'], isNonFlowAtom: true }, true)} />,
    )
    expect(screen.getByText('Alpha').getAttribute('style')).toContain('font-weight: 700')
    const wrapper = screen.getByLabelText('Alpha [Tag]')
    expect(wrapper.getAttribute('style')).toContain('dashed')
    expect(wrapper.getAttribute('style')).toContain('opacity: 0.55')
  })

  it.each([
    ['block', 1],
    ['compact', 0.5],
  ])('composes the compute-status badge unchanged over the %s state (seam discipline)', (_state, zoom) => {
    viewport.zoom = zoom
    const { container } = render(
      <AtomNode
        {...makeProps({ title: 'Total', labels: ['Tag'], computeStatus: { kind: 'ok', summary: 'Up to date' } })}
      />,
    )
    const badges = container.querySelector('[data-node-region="badges"]')!
    expect(badges.textContent).toContain('✓ OK')
    expect(container.querySelector('[data-node-region="body"]')).not.toBeNull()
  })
})
