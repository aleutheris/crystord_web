import { LabelChipEditor } from './LabelChipEditor'
import type { FilterBuilderProps } from './widgets.types'

/**
 * Style-neutral filter builder (ADR-260061 / EPIC-260066 T8) — the single "narrow atoms by
 * labels + category facets" widget reused by search, the category navigator, and the COLLECT
 * operation (§2). It owns the `WorkspaceFilter` shape and the label dimension (via
 * `LabelChipEditor`); the category-facet picker (a `CategoryTree` in pick mode) is injected as
 * `categoryFacets` and wired with data by EPIC-260068.
 */
export function FilterBuilder({
  filter,
  labelSuggestions,
  onChange,
  categoryFacets,
  ariaLabel = 'Filter',
  classNames,
}: FilterBuilderProps) {
  function setLabels(labels: string[]) {
    onChange({ ...filter, labels })
  }

  return (
    <div role="group" aria-label={ariaLabel} className={classNames?.root}>
      <section aria-label="Label filter" className={classNames?.section}>
        <LabelChipEditor
          labels={filter.labels}
          suggestions={labelSuggestions}
          onAdd={(label) => setLabels([...filter.labels, label])}
          onRemove={(label) => setLabels(filter.labels.filter((l) => l !== label))}
        />
      </section>
      <section aria-label="Category facets" className={classNames?.section}>
        {categoryFacets}
      </section>
    </div>
  )
}
