import { describe, it, expect } from 'vitest'
import { print, type OperationDefinitionNode } from 'graphql'
import {
  LIST_ATOM_GRANTS_QUERY,
  SHARE_ATOM_MUTATION,
  REVOKE_ATOM_ACCESS_MUTATION,
} from './sharing-operations'

// Pins the sharing documents to the ADR-260069 decision: an owner-only grants query selecting
// the full AtomGrantOutput, and share/revoke mutations addressing principals by username
// (USER) or workspace key (WORKSPACE) with the grantable AccessLevel (EDITOR/VIEWER).
describe('sharing-operations documents', () => {
  it('LIST_ATOM_GRANTS_QUERY takes a required atomUuid and selects all six grant fields', () => {
    const def = LIST_ATOM_GRANTS_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(LIST_ATOM_GRANTS_QUERY)
    expect(printed).toContain('$atomUuid: ID!')
    expect(printed).toContain('listAtomGrants(atomUuid: $atomUuid)')
    for (const field of ['principalUuid', 'principalType', 'principalName', 'level', 'grantedAt', 'grantedBy']) {
      expect(printed).toContain(field)
    }
  })

  it('SHARE_ATOM_MUTATION takes atomUuid + principal + type + grantable level', () => {
    const def = SHARE_ATOM_MUTATION.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('mutation')
    const printed = print(SHARE_ATOM_MUTATION)
    expect(printed).toContain('$atomUuid: ID!')
    expect(printed).toContain('$principal: String!')
    expect(printed).toContain('$principalType: PrincipalType!')
    // The schema's grantable AccessLevel — not the caller-held EffectiveAccessLevel.
    expect(printed).toContain('$level: AccessLevel!')
    // The printer wraps long argument lists — assert field + arguments wrap-tolerantly.
    expect(printed).toMatch(/shareAtom\(\s*atomUuid: \$atomUuid\s+principal: \$principal\s+principalType: \$principalType\s+level: \$level\s*\)/)
  })

  it('REVOKE_ATOM_ACCESS_MUTATION takes atomUuid + principal + type and no level', () => {
    const def = REVOKE_ATOM_ACCESS_MUTATION.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('mutation')
    const printed = print(REVOKE_ATOM_ACCESS_MUTATION)
    expect(printed).toContain('$atomUuid: ID!')
    expect(printed).toContain('$principal: String!')
    expect(printed).toContain('$principalType: PrincipalType!')
    expect(printed).not.toContain('$level')
    expect(printed).toMatch(/revokeAtomAccess\(\s*atomUuid: \$atomUuid\s+principal: \$principal\s+principalType: \$principalType\s*\)/)
  })

  it('stays lean — no atom body fields ride along', () => {
    for (const doc of [LIST_ATOM_GRANTS_QUERY, SHARE_ATOM_MUTATION, REVOKE_ATOM_ACCESS_MUTATION]) {
      const printed = print(doc)
      expect(printed).not.toContain('nuclearies')
      expect(printed).not.toContain('bonds')
    }
  })
})
