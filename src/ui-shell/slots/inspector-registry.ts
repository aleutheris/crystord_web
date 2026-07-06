import { DetailPanel } from '../../features/workspace-details'
import type { InspectorTabDescriptor } from './slot-types'

/**
 * Right-rail inspector registry (ADR-260061 / EPIC-260066 T2).
 *
 * T2 wires the existing `DetailPanel` as the single Details tab — no behavior change.
 * Classify, Compute, History, and Share tabs are registered by later epics
 * (EPIC-260067 / EPIC-260069 / EPIC-260073 / EPIC-260074).
 */
export const inspectorTabs: InspectorTabDescriptor[] = [
  { id: 'details', label: 'Details', Component: DetailPanel },
]
