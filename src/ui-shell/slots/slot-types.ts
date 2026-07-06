import type { ComponentType } from 'react'
import type { Atom } from '../../api-contract'
import type { GraphData } from '../../features/workspace-graph'

/**
 * Application-shell slot contracts (ADR-260061 / EPIC-260066).
 *
 * The shell exposes three extension points as static, typed slot tables in `ui-shell`:
 * navigators (left rail), views (center view-host), and inspector tabs (right rail). A
 * leaf registers a capability by exporting its component from its feature barrel and
 * adding one descriptor entry — compile-time composition, not a runtime plugin registry
 * (which REQ-CR-260010 excludes and which would invert the ui-shell → feature direction).
 */

/** Props every center view receives. Matches the existing GraphCanvas/NetworkCanvas contract. */
export interface ViewProps {
  data: GraphData
  selectedAtomId: string | null
  onSelectAtom: (id: string | null) => void
  onCreateAtom: () => void
  renderMode?: 'full' | 'reduced'
}

/** A center view-host entry (Flow, Network, Table, Board, …). */
export interface ViewDescriptor {
  id: string
  label: string
  /** Availability gate (e.g. a feature flag). Undefined = always available. */
  enabled?: boolean
  Component: ComponentType<ViewProps>
}

/** Props every inspector tab receives for the selected atom. */
export interface InspectorTabProps {
  atom: Atom
  onUpdate: (uuid: string, atom: Atom) => Promise<void>
  onDelete: (uuid: string) => void
  onClose: () => void
}

/** A right-rail inspector tab (Details, Classify, Compute, History, Share, …). */
export interface InspectorTabDescriptor {
  id: string
  label: string
  /** Optional per-atom relevance guard. Undefined = always shown. */
  when?: (atom: Atom) => boolean
  Component: ComponentType<InspectorTabProps>
}

/**
 * Props every left-rail navigator receives. Navigators are *scoping* surfaces — they browse
 * the index (labels, categories) and narrow the working set — **not** atom pickers. The
 * contract is intentionally minimal for now; a scope/filter affordance is added once the shared
 * filter builder defines the filter shape (EPIC-260066 T8 / EPIC-260068). Server-structure
 * navigators (Categories) fetch via api-contract rather than reading `atoms`.
 */
export interface NavigatorProps {
  atoms: Atom[]
}

/** A left-rail navigator lens (Labels, Categories, …). */
export interface NavigatorDescriptor {
  id: string
  label: string
  Component: ComponentType<NavigatorProps>
}
