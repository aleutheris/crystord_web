import { gql } from '@apollo/client'

/**
 * Per-atom change history (ADR-260068 / EPIC-260073 / REQ-FR-260076).
 *
 * Dedicated lean document: `retrieve(uuid)` selects ONLY the shellies uuid plus one `changes`
 * page, so the working-set RETRIEVE_QUERY never pays the history cost. Schema facts the UI
 * builds on: events arrive **newest-first**, there is **no total count** (end-of-history is
 * inferred from a short page), and there is **no user-lookup query** to resolve `userId`.
 */
export const ATOM_CHANGES_QUERY = gql`
  query AtomChanges($uuid: String!, $limit: Int!, $offset: Int!) {
    retrieve(uuid: $uuid) {
      properties {
        shellies {
          uuid
          changes(limit: $limit, offset: $offset) {
            timestamp
            eventType
            userId
            remark
            propertyChanges {
              field
              oldValue
              newValue
              metrics {
                removedCount
                addedCount
                totalMembersAfter
              }
            }
          }
        }
      }
    }
  }
`

/** Membership deltas for list-type fields (schema `PropertyChangeMetrics`; null on scalars). */
export interface PropertyChangeMetrics {
  removedCount: number
  addedCount: number
  totalMembersAfter: number
}

/** One field transition inside a change event. Values are the JSON scalar — any shape. */
export interface PropertyChange {
  field: string
  oldValue: unknown
  newValue: unknown
  metrics: PropertyChangeMetrics | null
}

/** One recorded change event on an atom (schema `ChangeEvent`). */
export interface ChangeEvent {
  timestamp: string
  eventType: string
  userId: string
  remark: string | null
  propertyChanges: PropertyChange[]
}

export interface AtomChangesResponse {
  /** `retrieve` returns a LIST — take the first element; an unknown uuid yields an empty one. */
  retrieve: {
    properties: {
      shellies: {
        uuid: string
        /** Nullable in the schema — treated as no recorded changes (ADR-260068). */
        changes: ChangeEvent[] | null
      }
    }
  }[]
}
