import { LabelsNavigator } from '../LabelsNavigator'
import { CategoriesNavigator } from '../../features/workspace-categories'
import type { NavigatorDescriptor } from './slot-types'

/**
 * Left-rail navigator registry (ADR-260061 / EPIC-260066).
 *
 * Labels is the reference lens (T5). Categories is the faceted category tree (ADR-260064 /
 * EPIC-260068) — the second navigator, which brings the registry-driven lens switcher in
 * LeftRail into existence.
 */
export const navigators: NavigatorDescriptor[] = [
  { id: 'labels', label: 'Labels', Component: LabelsNavigator },
  { id: 'categories', label: 'Categories', Component: CategoriesNavigator },
]
