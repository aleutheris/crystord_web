import { C_TEXT_SECONDARY } from '../styles/tokens'
import type { NavigatorProps } from './slots'

/**
 * Trivial Labels navigator (ADR-260061 / EPIC-260066 T5).
 *
 * The reference left-rail lens: lists the distinct labels present in the working set with
 * counts — the "see how the data is organized" brand promise in minimal form. Read-only for
 * now; clicking a label to scope the working set is wired when the shared filter builder lands
 * (EPIC-260066 T8 / EPIC-260068).
 */
export function LabelsNavigator({ atoms }: NavigatorProps) {
  const counts = new Map<string, number>()
  for (const atom of atoms) {
    for (const label of atom.labels ?? []) {
      counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  const labels = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  if (labels.length === 0) {
    return (
      <p style={{ margin: 0, padding: '0.5rem 0.6rem', fontSize: '0.8rem', color: C_TEXT_SECONDARY }}>
        No labels in the current results.
      </p>
    )
  }

  return (
    <ul aria-label="Labels" style={{ listStyle: 'none', margin: 0, padding: '0.25rem 0' }}>
      {labels.map(([label, count]) => (
        <li
          key={label}
          style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
        >
          <span>{label}</span>
          <span style={{ color: C_TEXT_SECONDARY }}>{count}</span>
        </li>
      ))}
    </ul>
  )
}
