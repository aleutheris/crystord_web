import type { CSSProperties, ReactNode } from 'react'

/**
 * Shared filtering & taxonomy widget contracts (ADR-260061 / EPIC-260066 T8).
 *
 * Style-neutral presentational widgets (data + callbacks injected, caller-styled via classNames),
 * matching the ui-primitives convention. Consumed by EPIC-260067 (Classify), EPIC-260068
 * (Categories), and EPIC-260069 (Compute / COLLECT).
 */

/** A category facet filter — maps to `retrieve(categories:)`: OR within a dimension, AND across. */
export interface CategoryFacetFilter {
  dimensionKey: string
  valueKeys: string[]
  includeDescendants: boolean
}

/** The shared filter the FilterBuilder produces and navigators / COLLECT consume. */
export interface WorkspaceFilter {
  labels: string[]
  categories: CategoryFacetFilter[]
}

/** A node in the category tree — maps to `retrieveCategoryBrowse` output. */
export interface CategoryTreeNode {
  key: string
  displayName: string
  dimensionKey?: string
  atomCount?: number
  children?: CategoryTreeNode[]
}

export interface LabelChipEditorClassNames {
  root?: string
  chip?: string
  remove?: string
  input?: string
}

export interface LabelChipEditorProps {
  labels: string[]
  suggestions?: string[]
  onAdd: (label: string) => void
  onRemove: (label: string) => void
  placeholder?: string
  ariaLabel?: string
  classNames?: LabelChipEditorClassNames
  /**
   * Per-chip inline style seam (ADR-260063): lets the caller tint chips (e.g. the deterministic
   * label palette) without the widget knowing about color policy. Merged over classNames styling.
   */
  chipStyle?: (label: string) => CSSProperties | undefined
  /**
   * Notifies the caller of uncommitted input text. A chip only exists once the user presses Enter,
   * so a form that gates submission on `labels` would otherwise reject a field the user has
   * visibly filled in. Callers that need submit-time validation (atom creation) track this;
   * callers that persist per-chip (Classify) ignore it, since committing a draft they never
   * confirmed would write an unintended label to the server.
   */
  onDraftChange?: (draft: string) => void
}

export interface CategoryTreeClassNames {
  root?: string
  item?: string
  toggle?: string
  select?: string
  label?: string
  count?: string
  edit?: string
  group?: string
}

export interface CategoryTreeProps {
  nodes: CategoryTreeNode[]
  expandedKeys: string[]
  onToggle: (key: string) => void
  onSelect?: (node: CategoryTreeNode) => void
  /** Permission seam (Q2): edit affordances render only where this returns true. */
  canEditNode?: (node: CategoryTreeNode) => boolean
  onEditNode?: (node: CategoryTreeNode) => void
  ariaLabel?: string
  classNames?: CategoryTreeClassNames
}

export interface FilterBuilderClassNames {
  root?: string
  section?: string
}

export interface FilterBuilderProps {
  filter: WorkspaceFilter
  labelSuggestions?: string[]
  onChange: (filter: WorkspaceFilter) => void
  /** Category-facet picker (the CategoryTree in pick mode), wired with data by EPIC-260068. */
  categoryFacets?: ReactNode
  ariaLabel?: string
  classNames?: FilterBuilderClassNames
}
