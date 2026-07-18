import { describe, it, expect, vi } from 'vitest'
import { atomsToNodes, atomsToEdges, atomsToNetworkEdges, atomsToFlowEdges, mergeNodePositions, cycleEdgeKeys, applyCycleStyling } from './graph-types'
import type { Atom } from '../../api-contract/graph-queries'
import type { Node } from '@xyflow/react'

vi.mock('@xyflow/react', () => ({
  MarkerType: { ArrowClosed: 'arrowclosed' },
}))

function makeAtom(uuid: string, title: string, labels: string[] = [], bonds: Atom['bonds'] = []): Atom {
  return {
    labels,
    bonds,
    properties: {
      shellies: { uuid },
      nuclearies: { title, description: '', content: '', operation: null, constants: null },
    },
  }
}

describe('atomsToNodes', () => {
  it('maps atoms to React Flow nodes with grid positions', () => {
    const atoms = [makeAtom('a1', 'Alpha', ['Tag']), makeAtom('a2', 'Beta')]
    const nodes = atomsToNodes(atoms)

    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({ id: 'a1', type: 'atom', data: { title: 'Alpha', labels: ['Tag'] } })
    expect(nodes[1]).toMatchObject({ id: 'a2', type: 'atom', data: { title: 'Beta', labels: [] } })
    expect(nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(nodes[1]!.position).toEqual({ x: 220, y: 0 })
  })

  it('returns empty array for no atoms', () => {
    expect(atomsToNodes([])).toEqual([])
  })

  it('stamps the LOD block data — content, operation, categories (ADR-260067 / EPIC-260072)', () => {
    const computed: Atom = {
      ...makeAtom('a1', 'Total', ['Num']),
      categories: [{ dimensionKey: 'region', valueKey: 'europe' }],
    }
    computed.properties.nuclearies.content = '12'
    computed.properties.nuclearies.operation = '{"name":"SUM","args":[]}'
    const [n1, n2] = atomsToNodes([computed, makeAtom('a2', 'Beta')])

    expect(n1!.data).toMatchObject({
      content: '12',
      operation: '{"name":"SUM","args":[]}',
      categories: [{ dimensionKey: 'region', valueKey: 'europe' }],
    })
    // Manual atom without categories: operation stays null, categories normalize to [].
    expect(n2!.data).toMatchObject({ content: '', operation: null, categories: [] })
  })

  it('threads canBond from the atom access level (read-side gating, BI-260061)', () => {
    const owner: Atom = { ...makeAtom('a1', 'Owned'), accessLevel: 'OWNER' }
    const editor: Atom = { ...makeAtom('a2', 'Editable'), accessLevel: 'EDITOR' }
    const viewer: Atom = { ...makeAtom('a3', 'ReadOnly'), accessLevel: 'VIEWER' }
    const unknown: Atom = makeAtom('a4', 'NoLevel') // missing → most restrictive
    const [n1, n2, n3, n4] = atomsToNodes([owner, editor, viewer, unknown])
    expect(n1!.data.canBond).toBe(true)
    expect(n2!.data.canBond).toBe(true)
    expect(n3!.data.canBond).toBe(false)
    expect(n4!.data.canBond).toBe(false)
  })
})

describe('atomsToEdges', () => {
  it('creates edges from bonds with direction "from"', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'DEPENDS_ON', direction: 'from' }]),
      makeAtom('a2', 'Beta'),
    ]
    const edges = atomsToEdges(atoms)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ source: 'a1', target: 'a2', label: 'DEPENDS_ON' })
  })

  it('ignores bonds with direction "to"', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'REF', direction: 'to' }]),
    ]
    expect(atomsToEdges(atoms)).toHaveLength(0)
  })

  it('returns empty for atoms without bonds', () => {
    expect(atomsToEdges([makeAtom('a1', 'X')])).toHaveLength(0)
  })
})

describe('atomsToNetworkEdges', () => {
  it('creates floating-type edges with label stripped and arrowhead marker', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'DEPENDS_ON', direction: 'from' }]),
      makeAtom('a2', 'Beta'),
    ]
    const edges = atomsToNetworkEdges(atoms)

    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ type: 'floating', source: 'a1', target: 'a2' })
    expect(edges[0]!.label).toBeUndefined()
    expect(edges[0]!.markerEnd).toMatchObject({ type: 'arrowclosed' })
  })

  it('preserves bond name in atomsToEdges data seam (label extensibility)', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'RELATES_TO', direction: 'from' }]),
      makeAtom('a2', 'Beta'),
    ]
    const raw = atomsToEdges(atoms)
    expect(raw[0]!.label).toBe('RELATES_TO')
  })
})

describe('atomsToFlowEdges', () => {
  const eligibleBonds = new Set(['OP_DEPENDENCY'])

  it('includes only bonds matching the eligible-bond allowlist', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [
        { uuid: 'a2', name: 'OP_DEPENDENCY', direction: 'from' },
        { uuid: 'a3', name: 'OTHER_BOND', direction: 'from' },
      ]),
      makeAtom('a2', 'Beta'),
      makeAtom('a3', 'Gamma'),
    ]
    const edges = atomsToFlowEdges(atoms, eligibleBonds)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.source).toBe('a1')
    expect(edges[0]!.target).toBe('a2')
  })

  it('renders edges with arrowhead marker (REQ-FR-260046)', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'OP_DEPENDENCY', direction: 'from' }]),
      makeAtom('a2', 'Beta'),
    ]
    const edges = atomsToFlowEdges(atoms, eligibleBonds)
    expect(edges[0]!.markerEnd).toMatchObject({ type: 'arrowclosed' })
  })

  it('suppresses bond labels for Flow view (REQ-FR-260046)', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'OP_DEPENDENCY', direction: 'from' }]),
      makeAtom('a2', 'Beta'),
    ]
    const edges = atomsToFlowEdges(atoms, eligibleBonds)
    expect(edges[0]!.label).toBeUndefined()
  })

  it('returns empty array for atoms without eligible bonds', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'RELATES_TO', direction: 'from' }]),
      makeAtom('a2', 'Beta'),
    ]
    expect(atomsToFlowEdges(atoms, eligibleBonds)).toHaveLength(0)
  })

  it('ignores bonds with direction "to"', () => {
    const atoms = [
      makeAtom('a1', 'Alpha', [], [{ uuid: 'a2', name: 'OP_DEPENDENCY', direction: 'to' }]),
      makeAtom('a2', 'Beta'),
    ]
    expect(atomsToFlowEdges(atoms, eligibleBonds)).toHaveLength(0)
  })
})

describe('mergeNodePositions', () => {
  it('preserves existing node positions for matching IDs', () => {
    const prev: Node[] = [
      { id: 'a1', type: 'atom', position: { x: 100, y: 200 }, data: { title: 'Old' } },
    ]
    const next: Node[] = [
      { id: 'a1', type: 'atom', position: { x: 0, y: 0 }, data: { title: 'New' } },
    ]
    const merged = mergeNodePositions(next, prev)

    expect(merged[0]!.position).toEqual({ x: 100, y: 200 })
    expect(merged[0]!.data.title).toBe('New')
  })

  it('uses computed position for new nodes', () => {
    const prev: Node[] = []
    const next: Node[] = [
      { id: 'a1', type: 'atom', position: { x: 50, y: 50 }, data: { title: 'First' } },
    ]
    const merged = mergeNodePositions(next, prev)

    expect(merged[0]!.position).toEqual({ x: 50, y: 50 })
  })
})

describe('cycleEdgeKeys (ADR-260065 / EPIC-260069)', () => {
  it('collects from->to keys across all atoms reporting cycle edges', () => {
    const a1: Atom = { ...makeAtom('a1', 'Alpha'), cycleEdges: [{ from: 'a1', to: 'a2' }] }
    const a2: Atom = { ...makeAtom('a2', 'Beta'), cycleEdges: [{ from: 'a2', to: 'a1' }, { from: 'a1', to: 'a2' }] }
    const keys = cycleEdgeKeys([a1, a2, makeAtom('a3', 'Gamma')])

    expect(keys).toEqual(new Set(['a1->a2', 'a2->a1']))
  })

  it('is empty when no atom reports cycle edges (absent or null field)', () => {
    const nullish: Atom = { ...makeAtom('a1', 'Alpha'), cycleEdges: null }
    expect(cycleEdgeKeys([nullish, makeAtom('a2', 'Beta')]).size).toBe(0)
  })
})

describe('applyCycleStyling (ADR-260065 / EPIC-260069)', () => {
  const edges = [
    { id: 'e1', source: 'a1', target: 'a2' },
    { id: 'e2', source: 'a2', target: 'a3' },
  ]

  it('danger-styles exactly the edges on a reported cycle', () => {
    const styled = applyCycleStyling(edges, new Set(['a1->a2']))
    expect(styled[0]!.style).toMatchObject({ stroke: 'var(--color-error)', strokeWidth: 2.5 })
    expect(styled[1]!.style).toBeUndefined()
  })

  it('preserves existing edge style properties when adding danger styling', () => {
    const withStyle = [{ id: 'e1', source: 'a1', target: 'a2', style: { opacity: 0.5 } }]
    const styled = applyCycleStyling(withStyle, new Set(['a1->a2']))
    expect(styled[0]!.style).toMatchObject({ opacity: 0.5, stroke: 'var(--color-error)' })
  })

  it('returns the edges untouched when there are no cycles', () => {
    expect(applyCycleStyling(edges, new Set())).toBe(edges)
  })
})
