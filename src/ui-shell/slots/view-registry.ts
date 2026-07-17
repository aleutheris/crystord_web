import { GraphCanvas, NetworkCanvas } from '../../features/workspace-graph'
import { TableView } from '../../features/workspace-table'
import { networkViewEnabled } from '../../feature-flags'
import type { ViewDescriptor } from './slot-types'

/**
 * Center view-host registry (ADR-260061 / EPIC-260066 T2).
 *
 * Order is display order. The node-graph (Flow/Network) is home; Table registers after the
 * graph views as a first-class peer, not the landing view (ADR-260062 / EPIC-260071); Board
 * is registered by EPIC-260075. Flow (`GraphCanvas`) is always available; Network
 * (`NetworkCanvas`) is gated by `networkViewEnabled` (ADR-260032).
 */
export const views: ViewDescriptor[] = [
  { id: 'network', label: 'Network', enabled: networkViewEnabled, Component: NetworkCanvas },
  { id: 'flow', label: 'Flow', Component: GraphCanvas },
  { id: 'table', label: 'Table', Component: TableView },
]

/**
 * Views available under the current gates (e.g. the `networkViewEnabled` flag). The shell
 * drives the tab bar, the default view, and the active-view lookup from this set, so
 * `enabled` is the authoritative gate for view availability.
 */
export const enabledViews: ViewDescriptor[] = views.filter((v) => v.enabled !== false)
