import { describe, it, expect } from 'vitest'
import { print, type OperationDefinitionNode } from 'graphql'
import {
  RETRIEVE_CATEGORY_DIMENSIONS_QUERY,
  RETRIEVE_CATEGORY_VALUES_QUERY,
  RETRIEVE_CATEGORY_BROWSE_QUERY,
  CREATE_CATEGORY_DIMENSION_MUTATION,
  CREATE_CATEGORY_VALUE_MUTATION,
  UPDATE_CATEGORY_DIMENSION_MUTATION,
  UPDATE_CATEGORY_VALUE_MUTATION,
  DELETE_CATEGORY_DIMENSION_MUTATION,
  DELETE_CATEGORY_VALUE_MUTATION,
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

  it('retrieveCategoryBrowse selects value + children with counts — never the atoms (ADR-260064)', () => {
    const def = RETRIEVE_CATEGORY_BROWSE_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(RETRIEVE_CATEGORY_BROWSE_QUERY)
    // Exactly-one-of node selectors plus child paging; all optional at the document level.
    for (const variable of ['$valueKey: String', '$dimensionKey: String', '$childLimit: Int', '$childOffset: Int']) {
      expect(printed).toContain(variable)
    }
    // print() wraps the long argument list — assert each binding, not the one-line form.
    expect(printed).toContain('retrieveCategoryBrowse(')
    for (const binding of ['valueKey: $valueKey', 'dimensionKey: $dimensionKey', 'childLimit: $childLimit', 'childOffset: $childOffset']) {
      expect(printed).toContain(binding)
    }
    expect(printed).toContain('atomCount')
    expect(printed).toContain('accessLevel')
    // The rail shows counts only — navigators scope, views represent.
    expect(printed).not.toMatch(/\batoms\b/)
  })
})

describe('category authoring mutations (ADR-260064 / EPIC-260068)', () => {
  it('create/update mutations select the key on their returns', () => {
    for (const doc of [
      CREATE_CATEGORY_DIMENSION_MUTATION,
      CREATE_CATEGORY_VALUE_MUTATION,
      UPDATE_CATEGORY_DIMENSION_MUTATION,
      UPDATE_CATEGORY_VALUE_MUTATION,
    ]) {
      const def = doc.definitions[0] as OperationDefinitionNode
      expect(def.operation).toBe('mutation')
      expect(print(doc)).toMatch(/\{\s*key\s*\}/)
    }
  })

  it('createCategoryValue carries dimensionKey and optional parentValueKeys', () => {
    const printed = print(CREATE_CATEGORY_VALUE_MUTATION)
    expect(printed).toContain('$dimensionKey: String!')
    expect(printed).toContain('$parentValueKeys: [String!]')
    expect(printed).not.toContain('$parentValueKeys: [String!]!')
  })

  it('delete mutations return the bare Boolean (no selection set)', () => {
    for (const [doc, field] of [
      [DELETE_CATEGORY_DIMENSION_MUTATION, 'deleteCategoryDimension'],
      [DELETE_CATEGORY_VALUE_MUTATION, 'deleteCategoryValue'],
    ] as const) {
      const def = doc.definitions[0] as OperationDefinitionNode
      expect(def.operation).toBe('mutation')
      const printed = print(doc)
      expect(printed).toContain(`${field}(key: $key)`)
      expect(printed).not.toContain(`${field}(key: $key) {`)
    }
  })
})
