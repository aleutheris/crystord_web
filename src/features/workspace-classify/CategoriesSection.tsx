import { useState } from 'react'
import type { AtomCategoryAssignment } from '../../api-contract'
import { CategoryTree } from '../../ui-primitives'
import type { CategoryTreeNode } from '../../ui-primitives'
import {
  C_BORDER, C_CARD_BG, C_ERROR, C_SURFACE, C_TEXT, C_TEXT_MUTED, C_TEXT_SECONDARY,
} from '../../styles/tokens'
import type { Taxonomy } from './use-taxonomy'
import {
  groupAssignmentsByDimension, valueDisplayName, buildCategoryPath, buildValueTree,
} from './category-display'

interface CategoriesSectionProps {
  categories: readonly AtomCategoryAssignment[]
  /** False while read-only (VIEWER/missing level) or while a save is in flight. */
  editable: boolean
  taxonomy: Taxonomy
  onAssign: (assignment: AtomCategoryAssignment) => void
  onClear: (valueKey: string) => void
}

/**
 * Category facet chips grouped by dimension + the pick-mode assignment tree (ADR-260063 /
 * REQ-FR-260071). Categories read as formal/structured: outlined rectangular chips on a neutral
 * surface with a `Dimension ▸` prefix — distinct from label pills by shape, fill, and prefix,
 * never by color alone (REQ-CR-260011). The full ancestor path rides in the chip tooltip.
 */
export function CategoriesSection({ categories, editable, taxonomy, onAssign, onClear }: CategoriesSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDimension, setPickerDimension] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  const groups = [...groupAssignmentsByDimension(categories).entries()]
  const dimensionName = (key: string): string =>
    taxonomy.dimensions.find((d) => d.key === key)?.displayName ?? key

  function choosePickerDimension(key: string) {
    setPickerDimension(key)
    if (key) taxonomy.loadValues(key)
  }

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  function handleSelect(node: CategoryTreeNode) {
    // Dedupe against existing assignments happens in the tab (it owns the atom build).
    onAssign({ dimensionKey: pickerDimension, valueKey: node.key })
    setPickerOpen(false)
  }

  const pickerValues = taxonomy.valuesByDimension.get(pickerDimension)

  return (
    <section aria-label="Categories">
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>Categories</h3>
      {taxonomy.error && (
        <p role="alert" style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: C_ERROR }}>{taxonomy.error}</p>
      )}
      {groups.length === 0 && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: C_TEXT_MUTED }}>No categories assigned.</p>
      )}
      {groups.map(([dimensionKey, assignments]) => (
        <div
          key={dimensionKey}
          role="group"
          aria-label={`Category dimension ${dimensionName(dimensionKey)}`}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}
        >
          <span style={{ color: C_TEXT_SECONDARY, fontSize: '0.8rem' }}>{dimensionName(dimensionKey)} ▸</span>
          {assignments.map((assignment) => {
            const values = taxonomy.valuesByDimension.get(dimensionKey)
            const name = valueDisplayName(assignment.valueKey, values)
            return (
              <span
                key={assignment.valueKey}
                title={buildCategoryPath(dimensionName(dimensionKey), assignment.valueKey, values)}
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
                }}
              >
                {name}
                {editable && (
                  <button
                    type="button"
                    aria-label={`Remove category ${name}`}
                    title="Clear"
                    onClick={() => onClear(assignment.valueKey)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C_TEXT_SECONDARY }}
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
      ))}

      {editable && (
        <button
          type="button"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          Assign category
        </button>
      )}
      {editable && pickerOpen && (
        <div style={{ marginTop: '0.5rem', border: `1px solid ${C_BORDER}`, borderRadius: 4, padding: '0.5rem', background: C_CARD_BG }}>
          <select
            aria-label="Dimension"
            value={pickerDimension}
            onChange={(e) => choosePickerDimension(e.target.value)}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          >
            <option value="">Choose dimension…</option>
            {taxonomy.dimensions.map((d) => (
              <option key={d.key} value={d.key}>{d.displayName}</option>
            ))}
          </select>
          {pickerDimension && (
            pickerValues === undefined ? (
              <p style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>Loading values…</p>
            ) : (
              <CategoryTree
                nodes={buildValueTree(pickerValues)}
                expandedKeys={expandedKeys}
                onToggle={toggleExpanded}
                onSelect={handleSelect}
                ariaLabel={`Values of ${dimensionName(pickerDimension)}`}
              />
            )
          )}
        </div>
      )}
    </section>
  )
}
