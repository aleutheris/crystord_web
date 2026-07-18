import { describe, it, expect } from 'vitest'
import { print, type OperationDefinitionNode } from 'graphql'
import { ATOM_CHANGES_QUERY } from './history-operations'

// Pins the history document to the ADR-260068 decision: a dedicated lean `retrieve(uuid)`
// selecting ONLY the shellies uuid + one changes page — never the atom body (the working-set
// RETRIEVE_QUERY owns that), so the audit read stays cheap and per-atom.
describe('history-operations documents', () => {
  it('ATOM_CHANGES_QUERY takes required uuid/limit/offset and pages the changes list', () => {
    const def = ATOM_CHANGES_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(ATOM_CHANGES_QUERY)
    expect(printed).toContain('$uuid: String!')
    expect(printed).toContain('$limit: Int!')
    expect(printed).toContain('$offset: Int!')
    expect(printed).toContain('retrieve(uuid: $uuid)')
    expect(printed).toContain('changes(limit: $limit, offset: $offset)')
  })

  it('selects the full ChangeEvent shape: envelope, property transitions, and metrics', () => {
    const printed = print(ATOM_CHANGES_QUERY)
    for (const field of ['timestamp', 'eventType', 'userId', 'remark', 'propertyChanges']) {
      expect(printed).toContain(field)
    }
    for (const field of ['field', 'oldValue', 'newValue', 'metrics']) {
      expect(printed).toContain(field)
    }
    for (const field of ['removedCount', 'addedCount', 'totalMembersAfter']) {
      expect(printed).toContain(field)
    }
  })

  it('stays lean — no atom body fields ride along (ADR-260068)', () => {
    const printed = print(ATOM_CHANGES_QUERY)
    expect(printed).not.toContain('nuclearies')
    expect(printed).not.toContain('labels')
    expect(printed).not.toContain('bonds')
  })
})
