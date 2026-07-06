import { GraphCanvas, NetworkCanvas } from '../../features/workspace-graph'
import { networkViewEnabled } from '../../feature-flags'
import type { ViewDescriptor } from './slot-types'

/**
 * Center view-host registry (ADR-260061 / EPIC-260066 T2).
 *
 * Order is display order. The node-graph (Flow/Network) is home; Table and Board are
 * registered by later epics (EPIC-260071 / EPIC-260075). Flow (`GraphCanvas`) is always
 * available; Network (`NetworkCanvas`) is gated by `networkViewEnabled` (ADR-260032).
 */
export const views: ViewDescriptor[] = [
  { id: 'network', label: 'Network', enabled: networkViewEnabled, Component: NetworkCanvas },
  { id: 'flow', label: 'Flow', Component: GraphCanvas },
]

/**
 * Views available under the current gates (e.g. the `networkViewEnabled` flag). The shell
 * drives the tab bar, the default view, and the active-view lookup from this set, so
 * `enabled` is the authoritative gate for view availability.
 */
export const enabledViews: ViewDescriptor[] = views.filter((v) => v.enabled !== false)
