import { GraphCanvas, NetworkCanvas, flowViewHelp, networkViewHelp } from '../../features/workspace-graph'
import { TableView, tableViewHelp } from '../../features/workspace-table'
import { BoardView, boardViewHelp } from '../../features/workspace-board'
import { networkViewEnabled } from '../../feature-flags'
import type { ViewDescriptor } from './slot-types'

/**
 * Center view-host registry (ADR-260061 / EPIC-260066 T2).
 *
 * Order is display order — all four planned center views are live. The node-graph
 * (Flow/Network) is home; Table registers after the graph views as a first-class peer, not
 * the landing view (ADR-260062 / EPIC-260071); Board registers last (ADR-260070 /
 * EPIC-260075). Flow (`GraphCanvas`) is always available; Network (`NetworkCanvas`) is
 * gated by `networkViewEnabled` (ADR-260032).
 */
export const views: ViewDescriptor[] = [
  { id: 'network', label: 'Network', enabled: networkViewEnabled, help: networkViewHelp, Component: NetworkCanvas },
  { id: 'flow', label: 'Flow', help: flowViewHelp, Component: GraphCanvas },
  { id: 'table', label: 'Table', help: tableViewHelp, Component: TableView },
  { id: 'board', label: 'Board', help: boardViewHelp, Component: BoardView },
]

/**
 * Views available under the current gates (e.g. the `networkViewEnabled` flag). The shell
 * drives the tab bar, the default view, and the active-view lookup from this set, so
 * `enabled` is the authoritative gate for view availability.
 */
export const enabledViews: ViewDescriptor[] = views.filter((v) => v.enabled !== false)

/**
 * Initial active view derived from the `homeEmphasis` preference (ADR-260065 / Q3):
 * `compute` → Flow (dependencies prominent), `relationship` → Network — falling back to
 * the first enabled view when the preferred one is gated off, and to Flow when the
 * enabled set is empty (unreachable today; Flow is unconditionally registered).
 */
export function initialActiveView(
  homeEmphasis: 'compute' | 'relationship',
  enabled: readonly { id: string }[],
): string {
  const preferred = homeEmphasis === 'relationship' ? 'network' : 'flow'
  if (enabled.some((v) => v.id === preferred)) return preferred
  return enabled[0]?.id ?? 'flow'
}
