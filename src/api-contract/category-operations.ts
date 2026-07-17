import { gql } from '@apollo/client'

/**
 * Taxonomy read documents + types (schema 9.2.0, ADR-260063 / EPIC-260067). Read-only here:
 * taxonomy authoring belongs to EPIC-260068. Both queries are access-scoped by the backend —
 * they return only taxonomy the caller owns or has been granted.
 */

export const RETRIEVE_CATEGORY_DIMENSIONS_QUERY = gql`
  query RetrieveCategoryDimensions($selector: CategoryDimensionSelector) {
    retrieveCategoryDimensions(selector: $selector) {
      key
      displayName
      description
      parentDimensionKeys
      accessLevel
      ownerUsername
    }
  }
`

export const RETRIEVE_CATEGORY_VALUES_QUERY = gql`
  query RetrieveCategoryValues($selector: CategoryValueSelector) {
    retrieveCategoryValues(selector: $selector) {
      key
      displayName
      description
      dimensionKey
      parentValueKeys
      accessLevel
      ownerUsername
    }
  }
`

export interface CategoryDimension {
  key: string
  displayName: string
  description: string | null
  parentDimensionKeys: string[]
  accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER'
  ownerUsername: string
}

export interface CategoryValue {
  key: string
  displayName: string
  description: string | null
  dimensionKey: string
  parentValueKeys: string[]
  accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER'
  ownerUsername: string
}

/** All fields optional — omit the selector (or any field) to broaden the result set. */
export interface CategoryDimensionSelector {
  key?: string
  uuid?: string
  parentDimensionKey?: string
  isRoot?: boolean
  isEmpty?: boolean
  limit?: number
  offset?: number
}

/** All fields optional — omit the selector (or any field) to broaden the result set. */
export interface CategoryValueSelector {
  key?: string
  uuid?: string
  dimensionKey?: string
  parentValueKey?: string
  isRoot?: boolean
  isUnused?: boolean
  limit?: number
  offset?: number
}

export interface RetrieveCategoryDimensionsResponse {
  retrieveCategoryDimensions: CategoryDimension[]
}

export interface RetrieveCategoryValuesResponse {
  retrieveCategoryValues: CategoryValue[]
}
