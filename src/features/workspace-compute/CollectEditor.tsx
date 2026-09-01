import { LabelChipEditor } from '../../ui-primitives'
import { COLLECT_QUERY_OPTIONS, OTHER_QUERY } from './operation-metadata'
import type { CollectEditorKind } from './operation-metadata'
import type { CategoryOption } from './category-option-list'
import { CategoryConstantSelects } from './CategoryConstantSelects'

interface CollectEditorProps {
  choice: string
  customQuery: string
  editor: CollectEditorKind
  labels: string[]
  dimensionKey: string
  valueKey: string
  dimensionOptions: readonly CategoryOption[]
  valueOptions: readonly CategoryOption[]
  categoriesLoading: boolean
  categoriesError: string | null
  dimensionsTruncated: boolean
  valuesTruncated: boolean
  onChoiceChange: (value: string) => void
  onCustomQueryChange: (value: string) => void
  onAddLabel: (label: string) => void
  onRemoveLabel: (label: string) => void
  onLabelDraftChange: (draft: string) => void
  onDimensionChange: (key: string) => void
  onValueChange: (key: string) => void
}

/**
 * COLLECT's argument editor (EPIC-260069, extended by EPIC-260082): the registered-query picker
 * plus whichever constants editor that query needs — label chips, or the category
 * dimension/value pickers.
 *
 * The `other…` path is deliberately unchanged from EPIC-260069: an unregistered query keeps the
 * labels editor and an ungated save, because the requirements of a query we do not ship are
 * unknown — gating on a requirement we cannot know would block a legitimate future registration.
 */
export function CollectEditor({
  choice,
  customQuery,
  editor,
  labels,
  dimensionKey,
  valueKey,
  dimensionOptions,
  valueOptions,
  categoriesLoading,
  categoriesError,
  dimensionsTruncated,
  valuesTruncated,
  onChoiceChange,
  onCustomQueryChange,
  onAddLabel,
  onRemoveLabel,
  onLabelDraftChange,
  onDimensionChange,
  onValueChange,
}: CollectEditorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div>
        <label htmlFor="compute-collect-query" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600 }}>
          Collect query
        </label>
        <select
          id="compute-collect-query"
          value={choice}
          onChange={(e) => onChoiceChange(e.target.value)}
          style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}
        >
          {COLLECT_QUERY_OPTIONS.map((q) => (
            <option key={q.name} value={q.name}>{q.label}</option>
          ))}
          <option value={OTHER_QUERY}>other…</option>
        </select>
        {choice === OTHER_QUERY && (
          <input
            aria-label="Custom collect query name"
            value={customQuery}
            placeholder="query name"
            onChange={(e) => onCustomQueryChange(e.target.value)}
            style={{ fontSize: '0.8rem', marginTop: '0.3rem', display: 'block' }}
          />
        )}
      </div>
      {editor === 'category' ? (
        <CategoryConstantSelects
          dimensionOptions={dimensionOptions}
          valueOptions={valueOptions}
          dimensionKey={dimensionKey}
          valueKey={valueKey}
          loading={categoriesLoading}
          error={categoriesError}
          dimensionsTruncated={dimensionsTruncated}
          valuesTruncated={valuesTruncated}
          onDimensionChange={onDimensionChange}
          onValueChange={onValueChange}
        />
      ) : (
        <div>
          <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
            Labels to collect
          </span>
          <LabelChipEditor
            labels={labels}
            ariaLabel="Collect labels"
            onAdd={onAddLabel}
            onRemove={onRemoveLabel}
            onDraftChange={onLabelDraftChange}
          />
        </div>
      )}
    </div>
  )
}
