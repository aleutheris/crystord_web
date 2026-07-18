import type { CategoryFacetFilter } from '../ui-primitives'
import { C_BORDER, C_SURFACE, C_TEXT, C_TEXT_SECONDARY } from '../styles/tokens'

interface FacetChipsProps {
  facets: CategoryFacetFilter[]
  onChange: (facets: CategoryFacetFilter[]) => void
}

/**
 * Removable category facet chips in the shell header (ADR-260064): one chip per
 * (dimension, value) pair in the `Dimension ▸ Value` grammar (EPIC-260067). Chips render the
 * facet KEYS — display-name resolution is the navigator's concern; keys are acceptable in the
 * MVP chip strip. Removing a chip drops the value from its dimension entry and drops the
 * entry when it empties (mirrors the navigator's toggle semantics).
 */
export function FacetChips({ facets, onChange }: FacetChipsProps) {
  if (facets.length === 0) return null

  function remove(dimensionKey: string, valueKey: string) {
    onChange(
      facets
        .map((f) => (f.dimensionKey === dimensionKey
          ? { ...f, valueKeys: f.valueKeys.filter((k) => k !== valueKey) }
          : f))
        .filter((f) => f.valueKeys.length > 0),
    )
  }

  return (
    <div
      role="group"
      aria-label="Category filters"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', flexShrink: 1, minWidth: 0 }}
    >
      {facets.flatMap((facet) =>
        facet.valueKeys.map((valueKey) => (
          <span
            key={`${facet.dimensionKey}:${valueKey}`}
            style={{
              border: `1px solid ${C_BORDER}`,
              background: C_SURFACE,
              color: C_TEXT,
              borderRadius: 3,
              padding: '0.1rem 0.4rem',
              fontSize: '0.8rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              whiteSpace: 'nowrap',
            }}
          >
            {facet.dimensionKey} ▸ {valueKey}
            <button
              type="button"
              aria-label={`Remove filter ${facet.dimensionKey} ▸ ${valueKey}`}
              title="Remove filter"
              onClick={() => remove(facet.dimensionKey, valueKey)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C_TEXT_SECONDARY }}
            >
              ×
            </button>
          </span>
        )),
      )}
    </div>
  )
}
