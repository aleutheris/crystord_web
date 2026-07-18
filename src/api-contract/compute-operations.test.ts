import { describe, it, expect } from 'vitest'
import { print, type OperationDefinitionNode } from 'graphql'
import { DISCOVER_OPERATIONS_QUERY } from './compute-operations'

// Pins the discovery document to the schema shape (ADR-260065 / EPIC-260069): name +
// description ONLY — no arity/type metadata exists, hence the client-side builtin table.
describe('compute-operations documents', () => {
  it('discoverOperations takes optional prefix/limit and selects name + description', () => {
    const def = DISCOVER_OPERATIONS_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(DISCOVER_OPERATIONS_QUERY)
    expect(printed).toContain('$prefix: String')
    expect(printed).not.toContain('String!')
    expect(printed).toContain('$limit: Int')
    expect(printed).toContain('discoverOperations(prefix: $prefix, limit: $limit)')
    expect(printed).toContain('name')
    expect(printed).toContain('description')
  })
})
