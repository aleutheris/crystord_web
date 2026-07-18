import { gql } from '@apollo/client'

/**
 * Operation discovery (ADR-260065 / EPIC-260069). The schema exposes name + description
 * only — no arity or type metadata — so the formula builder pairs this query with its
 * client-side metadata table for the built-ins (`workspace-compute/operation-metadata.ts`).
 */
export const DISCOVER_OPERATIONS_QUERY = gql`
  query DiscoverOperations($prefix: String, $limit: Int) {
    discoverOperations(prefix: $prefix, limit: $limit) {
      name
      description
    }
  }
`

export interface OperationFunction {
  name: string
  description: string
}

export interface DiscoverOperationsResponse {
  discoverOperations: OperationFunction[]
}
