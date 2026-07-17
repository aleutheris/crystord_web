import type { Atom } from '../../api-contract'

/**
 * Column-pluggable row sort for the Table view (ADR-260062 D5 / EPIC-260071).
 *
 * MVP ships title A–Z only, but the mechanism is a comparator table keyed by column so
 * user-selectable sort (a stated future enhancement, e.g. an `updatedAt` column once the
 * backend exposes a timestamp) drops in as a new entry without restructuring.
 */
export type TableSortKey = 'title'

const comparators: Record<TableSortKey, (a: Atom, b: Atom) => number> = {
  // Case-insensitive (accent-insensitive) locale compare — "alpha" and "Alpha" sort together.
  title: (a, b) =>
    a.properties.nuclearies.title.localeCompare(b.properties.nuclearies.title, undefined, {
      sensitivity: 'base',
    }),
}

/** Returns a new sorted array — never mutates the shared working set. */
export function sortAtoms(atoms: Atom[], key: TableSortKey = 'title'): Atom[] {
  return [...atoms].sort(comparators[key])
}
