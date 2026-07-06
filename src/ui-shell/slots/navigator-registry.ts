import { LabelsNavigator } from '../LabelsNavigator'
import type { NavigatorDescriptor } from './slot-types'

/**
 * Left-rail navigator registry (ADR-260061 / EPIC-260066).
 *
 * T5 registers the trivial Labels navigator (the reference lens). Categories joins in
 * EPIC-260068; a registry-driven lens switcher lands with that second navigator.
 */
export const navigators: NavigatorDescriptor[] = [
  { id: 'labels', label: 'Labels', Component: LabelsNavigator },
]
