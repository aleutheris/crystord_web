import type { AtomCategoryAssignment } from '../../api-contract/graph-queries'

/**
 * Pure level-of-detail helpers for the Flow `AtomNode` (ADR-260067 / EPIC-260072 /
 * REQ-FR-260075). One threshold, two states: below → compact chip, at/above → dense
 * Blender-style block. Kept free of React so the fork logic is trivially unit-testable.
 */

/** Zoom level at which the node body switches from compact chip to dense block. */
export const LOD_THRESHOLD = 0.75

export type LodState = 'compact' | 'block'

/** Maps the React Flow viewport zoom to the body's LOD state (>= threshold → block). */
export function lodStateForZoom(zoom: number): LodState {
  return zoom >= LOD_THRESHOLD ? 'block' : 'compact'
}

/** Maximum classification dots rendered before collapsing into a "+N" overflow cell. */
export const DOT_CAP = 4

/** Caps a dot list at DOT_CAP, reporting how many items the "+N" cell must account for. */
export function capDots<T>(items: T[]): { visible: T[]; overflow: number } {
  if (items.length <= DOT_CAP) return { visible: items, overflow: 0 }
  return { visible: items.slice(0, DOT_CAP), overflow: items.length - DOT_CAP }
}

/** Truncates a display value for the dense block's meta/title rows (ellipsis past `max`). */
export function truncateValue(value: string, max = 24): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

/**
 * One classification dot: round = label (shared palette hash, same color as Classify chips),
 * square = category dimension (one per distinct dimension key). Shape distinguishes the two
 * families; the text rides into the dot's tooltip/aria-label — never color alone
 * (REQ-CR-260011).
 */
export interface ClassificationDot {
  text: string
  shape: 'round' | 'square'
}

/** Builds the block state's dots row: label dots first, then distinct dimension-key dots. */
export function classificationDots(
  labels: string[],
  categories: AtomCategoryAssignment[],
): ClassificationDot[] {
  const dots: ClassificationDot[] = labels.map((label) => ({ text: label, shape: 'round' }))
  const seen = new Set<string>()
  for (const { dimensionKey } of categories) {
    if (!seen.has(dimensionKey)) {
      seen.add(dimensionKey)
      dots.push({ text: dimensionKey, shape: 'square' })
    }
  }
  return dots
}
