import { createContext, useContext, type ReactNode } from 'react'
import type { Atom } from '../api-contract'
import type { WorkspaceFilter } from '../ui-primitives'
import type { WorkspacePreferences } from './use-preferences'

/**
 * Shell-owned workspace state (ADR-260061 / EPIC-260066 T3).
 *
 * The single source of truth for the current selection and working set. `ui-shell` host
 * components (the inspector, and later the rails) consume it via `useWorkspace()` instead of
 * receiving it as props from `WorkspaceShell`. Feature components (the graph views) still
 * receive selection via props, since features must not import `ui-shell`.
 */
export interface WorkspaceSelection {
  selectedAtomId: string | null
  /** The selected atom, resolved from the working set. */
  selectedAtom: Atom | null
  select: (id: string | null) => void
}

export interface WorkspaceWorkingSet {
  atoms: Atom[]
  /**
   * The active working-set scope (ADR-260064). `filter.labels` mirrors submitted label search
   * only where cheaply available (the shell exposes `[]` — labels live inside useSearch);
   * `filter.categories` is the shell-owned facet state.
   */
  filter: WorkspaceFilter
  onFilterChange: (filter: WorkspaceFilter) => void
}

export interface WorkspaceContextValue {
  selection: WorkspaceSelection
  workingSet: WorkspaceWorkingSet
  preferences: WorkspacePreferences
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return ctx
}
