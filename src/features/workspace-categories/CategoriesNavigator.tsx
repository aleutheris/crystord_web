import { useMemo, useState } from 'react'
import { CategoryTree } from '../../ui-primitives'
import type { CategoryTreeNode, WorkspaceFilter } from '../../ui-primitives'
import { C_ERROR, C_TEXT_MUTED } from '../../styles/tokens'
import { useCategoryBrowse } from './use-category-browse'
import { buildCategoryTree } from './category-tree'
import { toggleFacetValue } from './facet-utils'
import { CategoryNodeEditor } from './CategoryNodeEditor'
import { AddDimensionForm } from './AddDimensionForm'

/**
 * Local slice of the navigator props (ADR-260064): features may not import ui-shell, so the
 * navigator declares only what it consumes — the filter types come from ui-primitives, which
 * features may import (precedent: ClassifyTab, TableView).
 */
interface CategoriesNavigatorProps {
  filter?: WorkspaceFilter
  onFilterChange?: (filter: WorkspaceFilter) => void
}

/**
 * Categories left-rail lens (ADR-260064 / REQ-FR-260072): a lazy faceted tree — dimensions on
 * top, values browse-loaded on expand with atom-count badges. Selecting a value toggles it in
 * the working-set facet filter (OR within a dimension, AND across); "Include subcategories"
 * sets includeDescendants for new entries. Inline authoring is gated per node on the REAL
 * accessLevel (Q2 — no admin surface).
 */
export function CategoriesNavigator({ filter, onFilterChange }: CategoriesNavigatorProps) {
  const browse = useCategoryBrowse()
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [addingDimension, setAddingDimension] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const tree = useMemo(
    () => buildCategoryTree(browse.dimensions, browse.childrenByNode),
    [browse.dimensions, browse.childrenByNode],
  )

  function handleToggle(key: string) {
    const expanding = !expandedKeys.includes(key)
    setExpandedKeys((prev) => (expanding ? [...prev, key] : prev.filter((k) => k !== key)))
    if (expanding) {
      // Every toggleable node is in the index (placeholders never get an expand affordance).
      const meta = tree.index.get(key)!
      browse.loadChildren({ kind: meta.kind, key: meta.key }) // loads once — the hook dedupes
    }
  }

  function handleSelect(node: CategoryTreeNode) {
    const meta = tree.index.get(node.key)
    if (!meta) return // the synthetic "Loading…" placeholder is not selectable
    if (meta.kind === 'dimension') {
      // Dimension nodes are not facets — selecting one just toggles its expansion.
      handleToggle(node.key)
      return
    }
    if (!onFilterChange) return
    const next = toggleFacetValue(filter?.categories ?? [], meta.dimensionKey, meta.key, includeDescendants)
    onFilterChange({ labels: filter?.labels ?? [], categories: next })
  }

  function canEditNode(node: CategoryTreeNode): boolean {
    const meta = tree.index.get(node.key)
    // Q2: gate on the node's REAL accessLevel from Category*Output (ADR-260064).
    return meta !== undefined && (meta.accessLevel === 'OWNER' || meta.accessLevel === 'EDITOR')
  }

  async function handleCreateDimension(key: string, displayName: string) {
    const ok = await browse.createDimension(key, displayName)
    if (ok) setAddingDimension(false)
  }

  const editingMeta = editingKey !== null ? tree.index.get(editingKey) : undefined

  return (
    <div style={{ padding: '0.5rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}>
          <input
            type="checkbox"
            aria-label="Include subcategories"
            checked={includeDescendants}
            onChange={(e) => setIncludeDescendants(e.target.checked)}
          />
          Include subcategories
        </label>
        <button
          type="button"
          aria-expanded={addingDimension}
          onClick={() => setAddingDimension((open) => !open)}
          style={{ padding: '0.15rem 0.5rem', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Add dimension
        </button>
      </div>

      {browse.loadError && (
        <p role="alert" style={{ margin: 0, fontSize: '0.78rem', color: C_ERROR }}>{browse.loadError}</p>
      )}
      {browse.mutationError && (
        <p role="alert" style={{ margin: 0, fontSize: '0.78rem', color: C_ERROR }}>{browse.mutationError}</p>
      )}

      {addingDimension && <AddDimensionForm onSubmit={(key, name) => void handleCreateDimension(key, name)} />}

      {tree.nodes.length === 0 && !browse.loading && (
        <p style={{ margin: 0, fontSize: '0.78rem', color: C_TEXT_MUTED }}>No categories yet.</p>
      )}

      <CategoryTree
        nodes={tree.nodes}
        expandedKeys={expandedKeys}
        onToggle={handleToggle}
        onSelect={handleSelect}
        canEditNode={canEditNode}
        onEditNode={(node) => setEditingKey((key) => (key === node.key ? null : node.key))}
        ariaLabel="Categories"
      />

      {editingMeta && (
        <CategoryNodeEditor
          key={editingMeta.key}
          meta={editingMeta}
          browse={browse}
          onClose={() => setEditingKey(null)}
        />
      )}
    </div>
  )
}
