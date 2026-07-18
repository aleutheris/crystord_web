import { DetailPanel } from '../../features/workspace-details'
import { ClassifyTab } from '../../features/workspace-classify'
import { ComputeTab } from '../../features/workspace-compute'
import type { InspectorTabDescriptor } from './slot-types'

/**
 * Right-rail inspector registry (ADR-260061 / EPIC-260066 T2).
 *
 * Details wires the existing `DetailPanel`; Classify (ADR-260063 / EPIC-260067) owns label +
 * category chip editing on the atom; Compute (ADR-260065 / EPIC-260069) owns the formula
 * builder and computation transparency. History and Share tabs are registered by later epics
 * (EPIC-260073 / EPIC-260074).
 */
export const inspectorTabs: InspectorTabDescriptor[] = [
  { id: 'details', label: 'Details', Component: DetailPanel },
  { id: 'classify', label: 'Classify', Component: ClassifyTab },
  { id: 'compute', label: 'Compute', Component: ComputeTab },
]
