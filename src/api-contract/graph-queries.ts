import { gql } from '@apollo/client'

export const LIST_LABELS_QUERY = gql`
  query ListLabels($prefix: String!) {
    listLabels(labelsPrefix: $prefix)
  }
`

export const RETRIEVE_QUERY = gql`
  query RetrieveAtoms($labels: [String!], $uuid: String, $categories: [CategoryFilterInput!]) {
    retrieve(labels: $labels, uuid: $uuid, categories: $categories) {
      labels
      ownerUuid
      accessLevel
      categories {
        dimensionKey
        valueKey
      }
      bonds {
        uuid
        name
        direction
      }
      evaluationStatus
      errorCode
      causes
      cycleNodes
      cycleEdges
      originNodeUuid
      affectedNodeUuid
      properties {
        shellies {
          uuid
        }
        nuclearies {
          title
          description
          content
          operation
          constants
        }
      }
    }
  }
`

export const CREATE_ATOMS_MUTATION = gql`
  mutation CreateAtoms($inputs: [AtomInput!]!) {
    change(inputs: $inputs)
  }
`

export const UPDATE_ATOM_MUTATION = gql`
  mutation UpdateAtom($selector: Selector!, $inputs: [AtomInput!]!) {
    change(selector: $selector, inputs: $inputs)
  }
`

export const DESTROY_ATOMS_MUTATION = gql`
  mutation DestroyAtoms($selector: DestroySelector!) {
    destroy(selector: $selector) {
      requested
      deleted
      notFound
    }
  }
`

export interface DestroyOutcome {
  requested: string[]
  deleted: string[]
  notFound: string[]
}

export interface DestroyResponse {
  destroy: DestroyOutcome
}

export interface AtomBond {
  uuid: string
  name: string
  direction: string
}

export interface AtomNuclearies {
  title: string
  description: string
  content: string
  operation: string | null
  constants: Record<string, unknown> | null
}

/**
 * The caller's EFFECTIVE access to an atom — what they HOLD (schema 8.1.0 `EffectiveAccessLevel`,
 * which includes OWNER). This is deliberately distinct from the schema's grantable `AccessLevel`
 * enum (`EDITOR`/`VIEWER` only), which belongs to the sharing epic's share/transfer surface.
 */
export type EffectiveAccessLevel = 'OWNER' | 'EDITOR' | 'VIEWER'

/** One category assignment on an atom (schema 9.2.0 `AtomOutput.categories`). */
export interface AtomCategoryAssignment {
  dimensionKey: string
  valueKey: string
}

export interface Atom {
  labels: string[]
  bonds: AtomBond[]
  properties: {
    shellies: { uuid: string }
    nuclearies: AtomNuclearies
  }
  /**
   * Owner and caller access level (schema 8.1.0 `AtomOutput.ownerUuid: ID!` /
   * `accessLevel: EffectiveAccessLevel!`). Modelled optional so existing mocks/older responses without
   * them stay valid; the read-side gating slice (BI-260061) defaults a missing level to most-restrictive.
   */
  ownerUuid?: string | null
  accessLevel?: EffectiveAccessLevel | null
  /**
   * Category assignments (schema 9.2.0). Modelled optional so existing mocks/older responses
   * without them stay valid (the established pattern, see ownerUuid above); `updateAtom` sends
   * `categories` only when present — AtomInput replace-all semantics (ADR-260063).
   */
  categories?: AtomCategoryAssignment[]
  /**
   * Evaluation reporting (ADR-260065 / EPIC-260069). All untyped in the schema and modelled
   * optional for mock-compat (the ownerUuid pattern above). `evaluationStatus` is one of
   * 'success' | 'failed-origin' | 'failed-propagated' | 'skipped-optional' when present;
   * unknown values map to no badge (`compute-status.ts` never guesses). The computed result
   * itself rides in `content` — there is no separate result field.
   */
  evaluationStatus?: string | null
  /** Failure code (e.g. 'AU-CYCLE-DETECTED', 'OP-DIVISION-BY-ZERO'). */
  errorCode?: string | null
  /** UUIDs of the failing dependencies (failed-propagated). */
  causes?: string[] | null
  /** Cycle member UUIDs (AU-CYCLE-DETECTED). */
  cycleNodes?: string[] | null
  /** Cycle edges — the JSON scalar arrives as a {from,to} pair list. */
  cycleEdges?: { from: string; to: string }[] | null
  originNodeUuid?: string | null
  affectedNodeUuid?: string | null
}

export interface RetrieveResponse {
  retrieve: Atom[]
}

export interface ListLabelsResponse {
  listLabels: string[]
}
