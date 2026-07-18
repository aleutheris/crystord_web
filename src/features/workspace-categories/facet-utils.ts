import type { CategoryFacetFilter } from '../../ui-primitives'

/**
 * Toggle a value inside its dimension's facet entry (ADR-260064 / REQ-FR-260072): OR within a
 * dimension (values accumulate in one entry), AND across dimensions (one entry per dimension).
 * `includeDescendants` applies only to NEW entries — an existing entry keeps its setting.
 * Removing the last value of an entry drops the entry entirely.
 */
export function toggleFacetValue(
  categories: CategoryFacetFilter[],
  dimensionKey: string,
  valueKey: string,
  includeDescendants: boolean,
): CategoryFacetFilter[] {
  const entry = categories.find((c) => c.dimensionKey === dimensionKey)
  if (!entry) {
    return [...categories, { dimensionKey, valueKeys: [valueKey], includeDescendants }]
  }
  if (!entry.valueKeys.includes(valueKey)) {
    return categories.map((c) => (c === entry ? { ...c, valueKeys: [...c.valueKeys, valueKey] } : c))
  }
  const remaining = entry.valueKeys.filter((k) => k !== valueKey)
  if (remaining.length === 0) {
    return categories.filter((c) => c !== entry)
  }
  return categories.map((c) => (c === entry ? { ...c, valueKeys: remaining } : c))
}
