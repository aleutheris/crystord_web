import { gql } from '@apollo/client'

/**
 * Taxonomy documents + types (schema 9.2.0). Reads landed with ADR-260063 / EPIC-260067;
 * the browse document, the authoring mutations, and the retrieve category filter shape are
 * ADR-260064 / EPIC-260068. All operations are access-scoped by the backend — they return
 * only taxonomy the caller owns or has been granted.
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

/**
 * Lazy tree browse (ADR-260064): exactly ONE of valueKey/dimensionKey selects the node.
 * Atoms under the node are deliberately NOT selected — navigators scope, views represent;
 * the rail shows count badges only.
 */
export const RETRIEVE_CATEGORY_BROWSE_QUERY = gql`
  query RetrieveCategoryBrowse($valueKey: String, $dimensionKey: String, $childLimit: Int, $childOffset: Int) {
    retrieveCategoryBrowse(valueKey: $valueKey, dimensionKey: $dimensionKey, childLimit: $childLimit, childOffset: $childOffset) {
      value {
        key
        displayName
        dimensionKey
        parentValueKeys
        accessLevel
      }
      children {
        value {
          key
          displayName
          dimensionKey
          parentValueKeys
          accessLevel
        }
        atomCount
      }
    }
  }
`

/** The value slice the browse query selects (no description/owner — the rail needs neither). */
export interface CategoryBrowseValue {
  key: string
  displayName: string
  dimensionKey: string
  parentValueKeys: string[]
  accessLevel: 'OWNER' | 'EDITOR' | 'VIEWER'
}

export interface CategoryBrowseChild {
  value: CategoryBrowseValue
  atomCount: number
}

export interface CategoryBrowseOutput {
  /** Null when browsing by dimensionKey (the node is the dimension itself). */
  value: CategoryBrowseValue | null
  children: CategoryBrowseChild[]
}

/** Exactly one of valueKey/dimensionKey must be set (schema 9.2.0 contract). */
export interface RetrieveCategoryBrowseVariables {
  valueKey?: string
  dimensionKey?: string
  childLimit?: number
  childOffset?: number
}

export interface RetrieveCategoryBrowseResponse {
  retrieveCategoryBrowse: CategoryBrowseOutput
}

/**
 * Category facet filter for `retrieve(categories:)` — maps to schema `CategoryFilterInput`.
 * Semantics (ADR-260064): AND across entries, OR within `valueKeys`.
 */
export interface CategoryFilter {
  dimensionKey: string
  valueKeys: string[]
  includeDescendants?: boolean
}

// --- Taxonomy authoring mutations (ADR-260064 / EPIC-260068 — inline rail authoring, Q2) ---

export const CREATE_CATEGORY_DIMENSION_MUTATION = gql`
  mutation CreateCategoryDimension($key: String!, $displayName: String!, $description: String) {
    createCategoryDimension(key: $key, displayName: $displayName, description: $description) {
      key
    }
  }
`

export const CREATE_CATEGORY_VALUE_MUTATION = gql`
  mutation CreateCategoryValue($key: String!, $displayName: String!, $dimensionKey: String!, $parentValueKeys: [String!]) {
    createCategoryValue(key: $key, displayName: $displayName, dimensionKey: $dimensionKey, parentValueKeys: $parentValueKeys) {
      key
    }
  }
`

export const UPDATE_CATEGORY_DIMENSION_MUTATION = gql`
  mutation UpdateCategoryDimension($key: String!, $displayName: String) {
    updateCategoryDimension(key: $key, displayName: $displayName) {
      key
    }
  }
`

export const UPDATE_CATEGORY_VALUE_MUTATION = gql`
  mutation UpdateCategoryValue($key: String!, $displayName: String) {
    updateCategoryValue(key: $key, displayName: $displayName) {
      key
    }
  }
`

export const DELETE_CATEGORY_DIMENSION_MUTATION = gql`
  mutation DeleteCategoryDimension($key: String!) {
    deleteCategoryDimension(key: $key)
  }
`

export const DELETE_CATEGORY_VALUE_MUTATION = gql`
  mutation DeleteCategoryValue($key: String!) {
    deleteCategoryValue(key: $key)
  }
`

export interface CreateCategoryDimensionResponse {
  createCategoryDimension: { key: string }
}

export interface CreateCategoryValueResponse {
  createCategoryValue: { key: string }
}

export interface UpdateCategoryDimensionResponse {
  updateCategoryDimension: { key: string }
}

export interface UpdateCategoryValueResponse {
  updateCategoryValue: { key: string }
}

export interface DeleteCategoryDimensionResponse {
  deleteCategoryDimension: boolean
}

export interface DeleteCategoryValueResponse {
  deleteCategoryValue: boolean
}
