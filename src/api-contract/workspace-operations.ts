import { gql } from '@apollo/client'

/**
 * Workspace-management documents + types (schema 9.2.0, ADR-260066 / REQ-FR-260074).
 *
 * Workspaces are sharing principals plus membership — there is NO current-workspace/session
 * concept, so these operations manage workspaces without "switching" to one. All operations
 * are Auth; the member/dissolve mutations are additionally Admin-gated server-side (the UI
 * soft-gates on the caller's derived role, the backend enforces).
 */

export type WorkspaceRole = 'ADMIN' | 'EDITOR' | 'VIEWER'

export interface Workspace {
  uuid: string
  key: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  memberCount: number
}

/** The slice the workspace mutations select on their `WorkspaceOutput` returns. */
export type WorkspaceMutationResult = Pick<Workspace, 'uuid' | 'key' | 'name' | 'description' | 'memberCount'>

export interface WorkspaceMember {
  userUuid: string
  username: string
  email: string
  role: WorkspaceRole
  joinedAt: string
}

export const LIST_MY_WORKSPACES_QUERY = gql`
  query ListMyWorkspaces {
    listMyWorkspaces {
      uuid
      key
      name
      description
      createdAt
      updatedAt
      memberCount
    }
  }
`

export interface ListMyWorkspacesResponse {
  listMyWorkspaces: Workspace[]
}

export const LIST_WORKSPACE_MEMBERS_QUERY = gql`
  query ListWorkspaceMembers($workspaceUuid: ID!) {
    listWorkspaceMembers(workspaceUuid: $workspaceUuid) {
      userUuid
      username
      email
      role
      joinedAt
    }
  }
`

export interface ListWorkspaceMembersVariables {
  workspaceUuid: string
}

export interface ListWorkspaceMembersResponse {
  listWorkspaceMembers: WorkspaceMember[]
}

export const CREATE_WORKSPACE_MUTATION = gql`
  mutation CreateWorkspace($key: String!, $name: String!, $description: String) {
    createWorkspace(key: $key, name: $name, description: $description) {
      uuid
      key
      name
      description
      memberCount
    }
  }
`

export interface CreateWorkspaceVariables {
  key: string
  name: string
  description?: string
}

export interface CreateWorkspaceResponse {
  createWorkspace: WorkspaceMutationResult
}

export const UPDATE_WORKSPACE_MUTATION = gql`
  mutation UpdateWorkspace($uuid: ID!, $name: String, $description: String) {
    updateWorkspace(uuid: $uuid, name: $name, description: $description) {
      uuid
      key
      name
      description
      memberCount
    }
  }
`

export interface UpdateWorkspaceVariables {
  uuid: string
  name?: string
  description?: string
}

export interface UpdateWorkspaceResponse {
  updateWorkspace: WorkspaceMutationResult
}

export const DISSOLVE_WORKSPACE_MUTATION = gql`
  mutation DissolveWorkspace($uuid: ID!) {
    dissolveWorkspace(uuid: $uuid)
  }
`

export interface DissolveWorkspaceVariables {
  uuid: string
}

export interface DissolveWorkspaceResponse {
  dissolveWorkspace: boolean
}

export const ADD_WORKSPACE_MEMBER_MUTATION = gql`
  mutation AddWorkspaceMember($workspaceUuid: ID!, $username: String!, $role: WorkspaceRole!) {
    addWorkspaceMember(workspaceUuid: $workspaceUuid, username: $username, role: $role) {
      userUuid
      username
      email
      role
      joinedAt
    }
  }
`

export interface AddWorkspaceMemberVariables {
  workspaceUuid: string
  username: string
  role: WorkspaceRole
}

export interface AddWorkspaceMemberResponse {
  addWorkspaceMember: WorkspaceMember
}

export const REMOVE_WORKSPACE_MEMBER_MUTATION = gql`
  mutation RemoveWorkspaceMember($workspaceUuid: ID!, $username: String!) {
    removeWorkspaceMember(workspaceUuid: $workspaceUuid, username: $username)
  }
`

export interface RemoveWorkspaceMemberVariables {
  workspaceUuid: string
  username: string
}

export interface RemoveWorkspaceMemberResponse {
  removeWorkspaceMember: boolean
}

export const UPDATE_WORKSPACE_MEMBER_ROLE_MUTATION = gql`
  mutation UpdateWorkspaceMemberRole($workspaceUuid: ID!, $username: String!, $role: WorkspaceRole!) {
    updateWorkspaceMemberRole(workspaceUuid: $workspaceUuid, username: $username, role: $role) {
      userUuid
      username
      email
      role
      joinedAt
    }
  }
`

export interface UpdateWorkspaceMemberRoleVariables {
  workspaceUuid: string
  username: string
  role: WorkspaceRole
}

export interface UpdateWorkspaceMemberRoleResponse {
  updateWorkspaceMemberRole: WorkspaceMember
}
