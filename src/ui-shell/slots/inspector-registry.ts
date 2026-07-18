import { DetailPanel } from '../../features/workspace-details'
import { ClassifyTab } from '../../features/workspace-classify'
import { ComputeTab } from '../../features/workspace-compute'
import { HistoryTab } from '../../features/workspace-history'
import { ShareTab } from '../../features/workspace-share'
import type { InspectorTabDescriptor } from './slot-types'

/**
 * Right-rail inspector registry (ADR-260061 / EPIC-260066 T2). All five planned tabs now live.
 *
 * Details wires the existing `DetailPanel`; Classify (ADR-260063 / EPIC-260067) owns label +
 * category chip editing on the atom; Compute (ADR-260065 / EPIC-260069) owns the formula
 * builder and computation transparency; History (ADR-260068 / EPIC-260073) is the read-only
 * field-level change audit; Share (ADR-260069 / EPIC-260074) manages access grants —
 * owner-gated via `when`, since every sharing operation is owner-only server-side.
 */
export const inspectorTabs: InspectorTabDescriptor[] = [
  { id: 'details', label: 'Details', Component: DetailPanel },
  { id: 'classify', label: 'Classify', Component: ClassifyTab },
  { id: 'compute', label: 'Compute', Component: ComputeTab },
  { id: 'history', label: 'History', Component: HistoryTab },
  { id: 'share', label: 'Share', when: (atom) => atom.accessLevel === 'OWNER', Component: ShareTab },
]
