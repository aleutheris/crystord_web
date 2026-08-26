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
      // Feed the LOD block state (ADR-260067): meta-row value, "ƒ" computed marker, dimension dots.
      content: atom.properties.nuclearies.content,
      operation: atom.properties.nuclearies.operation,
      categories: atom.categories ?? [],
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
// Edge direction is inverted relative to the raw bond pointer (ADR-260072): a bond with
// direction 'from' on `atom` means "atom depends on bond.uuid", but Flow view visualizes
// value flow, not the dependency reference — so the dependency (bond.uuid) is the edge
// source and the dependent atom is the edge target.
export function atomsToFlowEdges(atoms: Atom[], eligibleBonds: ReadonlySet<string>): Edge[] {
  const edges: Edge[] = []
  for (const atom of atoms) {
    const dependentId = atom.properties.shellies.uuid
    for (const bond of atom.bonds) {
      if (bond.direction === 'from' && eligibleBonds.has(bond.name)) {
        edges.push({
          id: `${dependentId}-${bond.uuid}-${bond.name}`,
          source: bond.uuid,
          target: dependentId,
          label: undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
        })
      }
    }
  }
  return edges
}

/**
 * Collects every reported cycle edge across the atoms into `to->from` keys, matching
 * atomsToFlowEdges' inverted (dependency -> dependent) direction (ADR-260072), so cycle
 * styling still lines up with the edges actually rendered in Flow view. The backend reports
 * `cycleEdges` as `{from, to}` in the raw dependency-pointer direction (ADR-260065 / EPIC-260069
 * — `cycleEdges` rides on each affected atom); the key is built as `to->from` here to invert it.
 */
export function cycleEdgeKeys(atoms: Atom[]): Set<string> {
  const keys = new Set<string>()
  for (const atom of atoms) {
    for (const pair of atom.cycleEdges ?? []) {
      keys.add(`${pair.to}->${pair.from}`)
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
