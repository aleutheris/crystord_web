import { gql } from '@apollo/client'

/**
 * Operation discovery (ADR-260065 / EPIC-260069).
 *
 * The pinned 9.3.0 schema's `OperationFunction` carries `minArity`, `maxArity` and `numericOnly`
 * alongside `name`/`description` (`schema.graphql:80-84`). **This document deliberately selects
 * neither**: adding them widens the frontend's used surface inside the pinned schema, which is the
 * ICR question EPIC-260082 deferred `collectQueries` to avoid, and nothing reads them yet. The
 * formula builder therefore pairs this query with a hand-maintained copy of the same contract in
 * `workspace-compute/operation-metadata.ts` — see that file for the consequence of the gap.
 *
 * Pre-9.3.0 revisions of this comment said the schema "exposes name + description only". That is
 * no longer true; do not restate it.
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
  /** Nullable in the schema (`description: String`) — a discovered operation may carry none. */
  description: string | null
}

export interface DiscoverOperationsResponse {
  discoverOperations: OperationFunction[]
}
