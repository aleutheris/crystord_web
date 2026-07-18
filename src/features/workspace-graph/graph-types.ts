import { MarkerType } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import type { Atom } from '../../api-contract/graph-queries'
import { atomPermissions } from '../../api-contract/access-control'
import { C_ERROR } from '../../styles/tokens'

export function atomsToNodes(atoms: Atom[]): Node[] {
  const count = atoms.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const spacing = 220

  return atoms.map((atom, i) => ({
    id: atom.properties.shellies.uuid,
    type: 'atom',
    position: {
      x: (i % cols) * spacing,
      y: Math.floor(i / cols) * spacing,
    },
    data: {
      title: atom.properties.nuclearies.title,
      labels: atom.labels,
      // Drives whether the node exposes a bond-create (source) handle — read-side gating (BI-260061).
      canBond: atomPermissions(atom.accessLevel).canBond,
    },
  }))
}

export function atomsToEdges(atoms: Atom[]): Edge[] {
  const edges: Edge[] = []

  for (const atom of atoms) {
    const sourceId = atom.properties.shellies.uuid
    for (const bond of atom.bonds) {
      if (bond.direction === 'from') {
        edges.push({
          id: `${sourceId}-${bond.uuid}-${bond.name}`,
          source: sourceId,
          target: bond.uuid,
          label: bond.name,
        })
      }
    }
  }

  return edges
}

export function atomsToNetworkEdges(atoms: Atom[]): Edge[] {
  return atomsToEdges(atoms).map((e) => ({
    ...e,
    type: 'floating',
    label: undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
  }))
}

// Produces Flow-view edges filtered to the eligible-bond allowlist.
// Labels are suppressed for readability; label seam retained via atomsToEdges base data (D5 / ADR-260039).
export function atomsToFlowEdges(atoms: Atom[], eligibleBonds: ReadonlySet<string>): Edge[] {
  const edges: Edge[] = []
  for (const atom of atoms) {
    const sourceId = atom.properties.shellies.uuid
    for (const bond of atom.bonds) {
      if (bond.direction === 'from' && eligibleBonds.has(bond.name)) {
        edges.push({
          id: `${sourceId}-${bond.uuid}-${bond.name}`,
          source: sourceId,
          target: bond.uuid,
          label: undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        })
      }
    }
  }
  return edges
}

/**
 * Collects every reported cycle edge across the atoms into `from->to` keys
 * (ADR-260065 / EPIC-260069 — `cycleEdges` rides on each affected atom).
 */
export function cycleEdgeKeys(atoms: Atom[]): Set<string> {
  const keys = new Set<string>()
  for (const atom of atoms) {
    for (const pair of atom.cycleEdges ?? []) {
      keys.add(`${pair.from}->${pair.to}`)
    }
  }
  return keys
}

/** Danger-styles the flow edges that are part of a reported dependency cycle (ADR-260065). */
export function applyCycleStyling(edges: Edge[], cycleKeys: ReadonlySet<string>): Edge[] {
  if (cycleKeys.size === 0) return edges
  return edges.map((e) =>
    cycleKeys.has(`${e.source}->${e.target}`)
      ? { ...e, style: { ...e.style, stroke: C_ERROR, strokeWidth: 2.5 } }
      : e,
  )
}

export function mergeNodePositions(
  newNodes: Node[],
  prevNodes: Node[],
): Node[] {
  return newNodes.map((n) => {
    const existing = prevNodes.find((p) => p.id === n.id)
    return existing ? { ...n, position: existing.position } : n
  })
}
