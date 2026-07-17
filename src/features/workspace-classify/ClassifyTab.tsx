import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Atom, AtomCategoryAssignment } from '../../api-contract'
import { atomPermissions } from '../../api-contract'
import { LabelChipEditor } from '../../ui-primitives'
import { labelColorToken } from '../../styles/label-colors'
import { C_BORDER, C_CHIP_TEXT, C_ERROR, C_TEXT_MUTED } from '../../styles/tokens'
import { useLabelSuggestions } from './use-label-suggestions'
import { useTaxonomy } from './use-taxonomy'
import { CategoriesSection } from './CategoriesSection'

/**
 * Local slice of the inspector-tab props (ADR-260063): features may not import ui-shell, so the
 * tab declares only what it consumes — a component accepting fewer props stays assignable to
 * the registry's `ComponentType<InspectorTabProps>` (precedent: TableView's `TableData`).
 */
interface ClassifyTabProps {
  atom: Atom
  onUpdate: (uuid: string, atom: Atom) => Promise<void>
}

/** Labels read as informal/fast: filled rounded pills tinted from the deterministic palette. */
function labelChipStyle(label: string): CSSProperties {
  return {
    background: labelColorToken(label),
    color: C_CHIP_TEXT,
    border: `1px solid ${C_BORDER}`,
    borderRadius: 999,
    padding: '0.1rem 0.5rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.8rem',
  }
}

/**
 * Classify inspector tab (ADR-260063 / REQ-FR-260071): label chip editor + category facet
 * chips on the selected atom. Every chip action persists immediately through `onUpdate` —
 * classification is fast, no form save. VIEWER/missing access renders everything read-only.
 */
export function ClassifyTab({ atom, onUpdate }: ClassifyTabProps) {
  const uuid = atom.properties.shellies.uuid
  const canEdit = atomPermissions(atom.accessLevel).canEdit
  const categories = useMemo(() => atom.categories ?? [], [atom.categories])
  const assignedDimensionKeys = useMemo(
    () => [...new Set(categories.map((c) => c.dimensionKey))],
    [categories],
  )
  const suggestions = useLabelSuggestions()
  const taxonomy = useTaxonomy(assignedDimensionKeys)
  // One save at a time: `onUpdate` is a full-document write built from the last-fetched atom, so
  // a second edit before the refetch lands would silently revert the first (TableView's rule —
  // one boolean suffices here because the tab shows a single atom).
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function save(next: Atom): Promise<void> {
    setSaving(true)
    try {
      await onUpdate(uuid, next)
      setSaveError(null)
    } catch {
      setSaveError('Could not save the change. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function assignCategory(assignment: AtomCategoryAssignment): void {
    // Dedupe: selecting an already-assigned value must not send a redundant replace-all write.
    if (categories.some((c) => c.valueKey === assignment.valueKey)) return
    void save({ ...atom, categories: [...categories, assignment] })
  }

  function clearCategory(valueKey: string): void {
    // Replace-all semantics: always send the full remaining array (ADR-260063).
    void save({ ...atom, categories: categories.filter((c) => c.valueKey !== valueKey) })
  }

  const editable = canEdit && !saving

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {!canEdit && (
        <p role="status" style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>
          You have view-only access to this atom.
        </p>
      )}
      {saveError && (
        <div role="alert" style={{ fontSize: '0.8rem', color: C_ERROR }}>{saveError}</div>
      )}

      <section aria-label="Labels">
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>Labels</h3>
        {editable ? (
          <LabelChipEditor
            labels={atom.labels}
            suggestions={suggestions}
            chipStyle={labelChipStyle}
            onAdd={(label) => void save({ ...atom, labels: [...atom.labels, label] })}
            onRemove={(label) => void save({ ...atom, labels: atom.labels.filter((l) => l !== label) })}
          />
        ) : (
          // Read-only (or save in flight): the same colored pills, no editor affordances.
          <div role="group" aria-label="Labels (read-only)" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {atom.labels.map((label) => (
              <span key={label} style={labelChipStyle(label)}>{label}</span>
            ))}
          </div>
        )}
      </section>

      <CategoriesSection
        categories={categories}
        editable={editable}
        taxonomy={taxonomy}
        onAssign={assignCategory}
        onClear={clearCategory}
      />
    </div>
  )
}
