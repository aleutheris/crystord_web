import { describe, it, expect } from 'vitest'
import { print, type OperationDefinitionNode } from 'graphql'
import {
  RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
  RETRIEVE_CATEGORY_VALUES_QUERY,
} from './category-operations'

// Pins the taxonomy read documents to the schema-9.2.0 shapes (ADR-260063 / EPIC-260067).
describe('category-operations documents', () => {
  it('retrieveCategoryDimensions takes an optional selector and selects the dimension fields', () => {
    const def = RETRIEVE_CATEGORY_DIMENSIONS_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(RETRIEVE_CATEGORY_DIMENSIONS_QUERY)
    expect(printed).toContain('$selector: CategoryDimensionSelector')
    expect(printed).not.toContain('CategoryDimensionSelector!')
    expect(printed).toContain('retrieveCategoryDimensions(selector: $selector)')
    for (const field of ['key', 'displayName', 'description', 'parentDimensionKeys', 'accessLevel', 'ownerUsername']) {
      expect(printed).toContain(field)
    }
  })

  it('retrieveCategoryValues takes an optional selector and selects the value fields', () => {
    const def = RETRIEVE_CATEGORY_VALUES_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(RETRIEVE_CATEGORY_VALUES_QUERY)
    expect(printed).toContain('$selector: CategoryValueSelector')
    expect(printed).not.toContain('CategoryValueSelector!')
    expect(printed).toContain('retrieveCategoryValues(selector: $selector)')
    for (const field of ['key', 'displayName', 'description', 'dimensionKey', 'parentValueKeys', 'accessLevel', 'ownerUsername']) {
      expect(printed).toContain(field)
    }
    expect(printed).not.toContain('parentDimensionKeys')
  })
})
