import { gql } from '@apollo/client'

/**
 * Atom-sharing documents + types (schema 9.2.0, ADR-260069 / REQ-FR-260077).
 *
 * All three operations are **owner-only** server-side — the Share tab gates on the caller
 * holding OWNER so it never offers them to a caller they would reject. A principal is a
 * **username** (USER) or a **workspace key** (WORKSPACE); the backend resolves it and answers
 * `CR-16-PRINCIPAL-UNKNOWN` when nothing matches (mapped centrally in `error-codes.ts`).
 */

/** Who a grant targets (schema `PrincipalType`): a user by username or a workspace by key. */
export type PrincipalType = 'USER' | 'WORKSPACE'

/**
 * The **grantable** access level (schema `AccessLevel`): EDITOR | VIEWER only. Deliberately
 * distinct from `EffectiveAccessLevel` (graph-queries.ts), which adds the non-grantable OWNER —
 * ownership moves only via `transferAtomOwnership`, out of this surface's scope (ADR-260069).
 */
export type GrantableAccessLevel = 'EDITOR' | 'VIEWER'

/** One access grant on an atom (schema `AtomGrantOutput`). */
export interface AtomGrant {
  principalUuid: string
  principalType: PrincipalType
  /** The resolvable principal: the username (USER) or workspace key (WORKSPACE). */
  principalName: string
  level: GrantableAccessLevel
  grantedAt: string
  grantedBy: string
}

export const LIST_ATOM_GRANTS_QUERY = gql`
  query ListAtomGrants($atomUuid: ID!) {
    listAtomGrants(atomUuid: $atomUuid) {
      principalUuid
      principalType
      principalName
      level
      grantedAt
      grantedBy
    }
  }
`

export interface ListAtomGrantsVariables {
  atomUuid: string
}

export interface ListAtomGrantsResponse {
  listAtomGrants: AtomGrant[]
}

export const SHARE_ATOM_MUTATION = gql`
  mutation ShareAtom($atomUuid: ID!, $principal: String!, $principalType: PrincipalType!, $level: AccessLevel!) {
    shareAtom(atomUuid: $atomUuid, principal: $principal, principalType: $principalType, level: $level)
  }
`

export interface ShareAtomVariables {
  atomUuid: string
  principal: string
  principalType: PrincipalType
  level: GrantableAccessLevel
}

export interface ShareAtomResponse {
  shareAtom: boolean
}

export const REVOKE_ATOM_ACCESS_MUTATION = gql`
  mutation RevokeAtomAccess($atomUuid: ID!, $principal: String!, $principalType: PrincipalType!) {
    revokeAtomAccess(atomUuid: $atomUuid, principal: $principal, principalType: $principalType)
  }
`

export interface RevokeAtomAccessVariables {
  atomUuid: string
  principal: string
  principalType: PrincipalType
}

export interface RevokeAtomAccessResponse {
  revokeAtomAccess: boolean
}
