import type { ComponentType } from 'react'
import type { Atom } from '../../api-contract'
import type { HelpSection } from '../../help'
import type { GraphData } from '../../features/workspace-graph'
import type { WorkspaceFilter } from '../../ui-primitives'

/**
 * Application-shell slot contracts (ADR-260061 / EPIC-260066).
 *
 * The shell exposes three extension points as static, typed slot tables in `ui-shell`:
 * navigators (left rail), views (center view-host), and inspector tabs (right rail). A
 * leaf registers a capability by exporting its component from its feature barrel and
 * adding one descriptor entry — compile-time composition, not a runtime plugin registry
 * (which REQ-CR-260010 excludes and which would invert the ui-shell → feature direction).
 *
 * `help` is **required** on all three descriptors (ADR-260085 / EPIC-260080 C2): registering a
 * surface without user-facing help fails typecheck (`TS2741`). That gate proves presence, not
 * truth — no compiler can tell that a sentence is still accurate after a surface's meaning
 * changes underneath it. The instrument for that is the process obligation in
 * `project-instructions.md` §6, and it is a human check.
 */

/** Props every center view receives. Matches the existing GraphCanvas/NetworkCanvas contract. */
export interface ViewProps {
  data: GraphData
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  onCreateAtom: () => void
  renderMode?: 'full' | 'reduced'
  /**
   * Compute-badge visibility preference (ADR-260065, additive): `always` shows status badges
   * on every computed atom, `onDemand` only on the selected one. Optional — non-graph views
   * and older callers ignore it; absent means `always`.
   */
  computeBadges?: 'always' | 'onDemand'
}

/** A center view-host entry (Flow, Network, Table, Board, …). */
export interface ViewDescriptor {
  id: string
  label: string
  /** Availability gate (e.g. a feature flag). Undefined = always available. */
  enabled?: boolean
  /** User-facing help for this view, authored in the feature module that owns it. Required. */
  help: HelpSection
  Component: ComponentType<ViewProps>
}

/** Props every inspector tab receives for the selected atom. */
export interface InspectorTabProps {
  atom: Atom
  onUpdate: (uuid: string, atom: Atom) => Promise<void>
  onDelete: (uuid: string) => void
  onClose: () => void
  /**
   * The current working set (ADR-260065, additive): the Inspector passes `workingSet.atoms`
   * so tabs can resolve atom references to titles (Compute's picker/Explain). Optional —
   * existing tabs ignore it.
   */
  atoms?: Atom[]
}

/** A right-rail inspector tab (Details, Classify, Compute, History, Share, …). */
export interface InspectorTabDescriptor {
  id: string
  label: string
  /** Optional per-atom relevance guard. Undefined = always shown. */
  when?: (atom: Atom) => boolean
  /** User-facing help for this tab, authored in the feature module that owns it. Required. */
  help: HelpSection
  Component: ComponentType<InspectorTabProps>
}

/**
 * Props every left-rail navigator receives. Navigators are *scoping* surfaces — they browse
 * the index (labels, categories) and narrow the working set — **not** atom pickers.
 * Server-structure navigators (Categories) fetch via api-contract rather than reading `atoms`.
 * The filter contract deferred by EPIC-260066 is the additive optional pair below
 * (ADR-260064): the shell owns the filter; a navigator proposes changes through the callback.
 */
export interface NavigatorProps {
  atoms: Atom[]
  filter?: WorkspaceFilter
  onFilterChange?: (filter: WorkspaceFilter) => void
}

/** A left-rail navigator lens (Labels, Categories, …). */
export interface NavigatorDescriptor {
  id: string
  label: string
  /** User-facing help for this lens, authored beside the component that owns it. Required. */
  help: HelpSection
  Component: ComponentType<NavigatorProps>
}
