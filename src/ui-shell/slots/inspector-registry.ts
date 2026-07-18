import { DetailPanel } from '../../features/workspace-details'
import { ClassifyTab } from '../../features/workspace-classify'
import { ComputeTab } from '../../features/workspace-compute'
import { HistoryTab } from '../../features/workspace-history'
import type { InspectorTabDescriptor } from './slot-types'

/**
 * Right-rail inspector registry (ADR-260061 / EPIC-260066 T2).
 *
 * Details wires the existing `DetailPanel`; Classify (ADR-260063 / EPIC-260067) owns label +
 * category chip editing on the atom; Compute (ADR-260065 / EPIC-260069) owns the formula
 * builder and computation transparency; History (ADR-260068 / EPIC-260073) is the read-only
 * field-level change audit. The Share tab is registered by a later epic (EPIC-260074).
 */
export const inspectorTabs: InspectorTabDescriptor[] = [
  { id: 'details', label: 'Details', Component: DetailPanel },
  { id: 'classify', label: 'Classify', Component: ClassifyTab },
  { id: 'compute', label: 'Compute', Component: ComputeTab },
  { id: 'history', label: 'History', Component: HistoryTab },
]
