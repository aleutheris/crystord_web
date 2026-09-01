import { C_TEXT_SECONDARY, C_ERROR } from '../../styles/tokens'
import { TAXONOMY_PAGE_LIMIT } from './category-option-list'
import type { CategoryOption } from './category-option-list'

interface CategoryConstantSelectsProps {
  dimensionOptions: readonly CategoryOption[]
  valueOptions: readonly CategoryOption[]
  dimensionKey: string
  valueKey: string
  loading: boolean
  error: string | null
  dimensionsTruncated: boolean
  valuesTruncated: boolean
  onDimensionChange: (key: string) => void
  onValueChange: (key: string) => void
}

const selectStyle = { fontSize: '0.85rem', marginTop: '0.2rem', display: 'block' }
const labelStyle = { display: 'block', fontSize: '0.8rem', fontWeight: 600 }
const noteStyle = { margin: '0.15rem 0 0', fontSize: '0.7rem', color: C_TEXT_SECONDARY }

/**
 * A list that came back FULL at the server's page ceiling. Said rather than left implicit: the
 * pickers do not page, so anything past the limit cannot be chosen here at all, and a silently
 * short list reads as "your taxonomy has nothing else".
 *
 * **Hedged on purpose.** A full page is genuinely ambiguous — the response carries no total and
 * no has-more, so exactly-100 and the-first-100-of-more are indistinguishable. "some are not
 * listed" would state as fact something the code cannot establish, and would be flatly false for
 * a taxonomy of exactly 100. That is the same class of falsehood as the "(not in your taxonomy)"
 * mislabel these pickers already exist to avoid; the ambiguity is reported as ambiguity.
 */
function TruncationNote({ noun }: { noun: string }) {
  return (
    <p style={noteStyle}>
      Showing the first {TAXONOMY_PAGE_LIMIT} {noun}; there may be more.
    </p>
  )
}

/**
 * Dimension/value pickers for the category COLLECT queries (EPIC-260082). Presentational — the
 * options arrive already sticky-marked (a stored key the list does not offer) and
 * ownership-marked (a granted value the query cannot resolve), so this only renders them.
 *
 * The keys are never typed by hand: a mistyped `dimension_key`/`value_key` pair resolves to
 * nothing in the caller's taxonomy and silently collects an empty list rather than erroring.
 */
export function CategoryConstantSelects({
  dimensionOptions,
  valueOptions,
  dimensionKey,
  valueKey,
  loading,
  error,
  dimensionsTruncated,
  valuesTruncated,
  onDimensionChange,
  onValueChange,
}: CategoryConstantSelectsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div>
        <label htmlFor="compute-collect-dimension" style={labelStyle}>
          Category dimension
        </label>
        <select
          id="compute-collect-dimension"
          value={dimensionKey}
          onChange={(e) => onDimensionChange(e.target.value)}
          style={selectStyle}
        >
          <option value="">Choose a dimension…</option>
          {dimensionOptions.map((d) => (
            <option key={d.key} value={d.key}>{d.displayName}</option>
          ))}
        </select>
        {dimensionsTruncated && <TruncationNote noun="dimensions" />}
      </div>
      <div>
        <label htmlFor="compute-collect-value" style={labelStyle}>
          Category value
        </label>
        <select
          id="compute-collect-value"
          value={valueKey}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={dimensionKey === ''}
          style={selectStyle}
        >
          <option value="">Choose a value…</option>
          {valueOptions.map((v) => (
            // A value the caller does not own stays visible but unselectable: the COLLECT query
            // cannot resolve it, and hiding it would not explain why it is missing here when
            // Classify still offers it.
            <option key={v.key} value={v.key} disabled={v.unusable === true}>{v.displayName}</option>
          ))}
        </select>
        {valuesTruncated && <TruncationNote noun="values" />}
      </div>
      {loading && (
        <p style={{ margin: 0, fontSize: '0.72rem', color: C_TEXT_SECONDARY }}>Loading categories…</p>
      )}
      {error && (
        <p role="status" style={{ margin: 0, fontSize: '0.72rem', color: C_ERROR }}>{error}</p>
      )}
    </div>
  )
}
