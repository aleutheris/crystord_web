import { describe, it, expect } from 'vitest'
import { print, type OperationDefinitionNode } from 'graphql'
import {
  LIST_MY_WORKSPACES_QUERY,
  LIST_WORKSPACE_MEMBERS_QUERY,
  CREATE_WORKSPACE_MUTATION,
  UPDATE_WORKSPACE_MUTATION,
  DISSOLVE_WORKSPACE_MUTATION,
  ADD_WORKSPACE_MEMBER_MUTATION,
  REMOVE_WORKSPACE_MEMBER_MUTATION,
  UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION,
} from './workspace-operations'

// Pins the workspace-management documents to the schema-9.2.0 shapes (ADR-260066 / REQ-FR-260074).
describe('workspace-operations documents', () => {
  it('listMyWorkspaces takes no variables and selects the full workspace fields', () => {
    const def = LIST_MY_WORKSPACES_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    expect(def.variableDefinitions).toHaveLength(0)
    const printed = print(LIST_MY_WORKSPACES_QUERY)
    for (const field of ['uuid', 'key', 'name', 'description', 'createdAt', 'updatedAt', 'memberCount']) {
      expect(printed).toContain(field)
    }
  })

  it('listWorkspaceMembers requires the workspace uuid and selects the member fields', () => {
    const def = LIST_WORKSPACE_MEMBERS_QUERY.definitions[0] as OperationDefinitionNode
    expect(def.operation).toBe('query')
    const printed = print(LIST_WORKSPACE_MEMBERS_QUERY)
    expect(printed).toContain('$workspaceUuid: ID!')
    expect(printed).toContain('listWorkspaceMembers(workspaceUuid: $workspaceUuid)')
    for (const field of ['userUuid', 'username', 'email', 'role', 'joinedAt']) {
      expect(printed).toContain(field)
    }
  })

  it('createWorkspace requires key and name, description stays optional', () => {
    const printed = print(CREATE_WORKSPACE_MUTATION)
    expect(printed).toContain('$key: String!')
    expect(printed).toContain('$name: String!')
    expect(printed).toContain('$description: String')
    expect(printed).not.toContain('$description: String!')
  })

  it('updateWorkspace requires only the uuid — name and description are optional patches', () => {
    const printed = print(UPDATE_WORKSPACE_MUTATION)
    expect(printed).toContain('$uuid: ID!')
    expect(printed).not.toContain('$name: String!')
    expect(printed).not.toContain('$description: String!')
  })

  it('workspace mutations select the WorkspaceOutput summary slice on their returns', () => {
    for (const doc of [CREATE_WORKSPACE_MUTATION, UPDATE_WORKSPACE_MUTATION]) {
      const def = doc.definitions[0] as OperationDefinitionNode
      expect(def.operation).toBe('mutation')
      const printed = print(doc)
      for (const field of ['uuid', 'key', 'name', 'description', 'memberCount']) {
        expect(printed).toContain(field)
      }
      // The mutation slice omits the timestamps the list query selects.
      expect(printed).not.toContain('createdAt')
      expect(printed).not.toContain('updatedAt')
    }
  })

  it('member add/role mutations bind username + WorkspaceRole and select the member fields', () => {
    for (const doc of [ADD_WORKSPACE_MEMBER_MUTATION, UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION]) {
      const def = doc.definitions[0] as OperationDefinitionNode
      expect(def.operation).toBe('mutation')
      const printed = print(doc)
      expect(printed).toContain('$workspaceUuid: ID!')
      expect(printed).toContain('$username: String!')
      expect(printed).toContain('$role: WorkspaceRole!')
      for (const field of ['userUuid', 'username', 'email', 'role', 'joinedAt']) {
        expect(printed).toContain(field)
      }
    }
  })

  it('dissolve/remove mutations return the bare Boolean (no selection set)', () => {
    for (const [doc, tail] of [
      [DISSOLVE_WORKSPACE_MUTATION, 'dissolveWorkspace(uuid: $uuid)'],
      [REMOVE_WORKSPACE_MEMBER_MUTATION, 'removeWorkspaceMember(workspaceUuid: $workspaceUuid, username: $username)'],
    ] as const) {
      const def = doc.definitions[0] as OperationDefinitionNode
      expect(def.operation).toBe('mutation')
      const printed = print(doc)
      expect(printed).toContain(tail)
      expect(printed).not.toContain(`${tail} {`)
    }
  })
})
