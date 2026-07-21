# Learning Record: LRN-002 Verify against the authoritative contract, not adjacent artifacts

## 1. Context

- Date discovered: 2026-07-21
- Discovered by: Project owner, during EPIC-260076 ideation (twice, in the same session)
- Area: Category taxonomy surface (`src/api-contract/category-operations.ts`, `docs/crystord_server/schema.graphql`); AI-assisted analysis workflow generally
- Trigger: Two confident, incorrect capability claims that survived until the owner pushed back

## 2. What Happened

Two structurally identical errors, both asserting a constraint that did not exist:

1. **"The backend cannot nest category dimensions."** Based on reading
   `CREATE_CATEGORY_DIMENSION_MUTATION` in `src/api-contract/`, which omits a parent argument.
   A full governance response was recommended on that basis: an ICR, backend-team coordination,
   and an ADR supersede. The actual schema has
   `createCategoryDimension(..., parentDimensionKeys, childDimensionKeys)` plus
   `connectCategoryDimensions` / `disconnectCategoryDimensions`. No interface change was needed
   and no backend work existed. The real gap was frontend-only.

2. **"Nesting a populated dimension is blocked until its values are paired."** Based on a schema
   comment about value containment (`CAT-VALUE-PARENT-DIMENSION-MISMATCH`) attached to
   `createCategoryValue` / `connectCategoryValues`, generalized to `connectCategoryDimensions`.
   Dimension operations validate only existence, single-parent
   (`CAT-MULTIPLE-PARENTS-UNSUPPORTED`), and acyclicity (`CAT-DIMENSION-CYCLE`); they never
   inspect values. This fabricated blocker was written into the epic as its "central open
   question" and reported as the one thing preventing the plan-review gate.

The second error occurred *after* correction on the first, in the same subject area.

## 3. Why It Happened

- **Proximate evidence treated as authoritative.** A client-side GraphQL document is a *selection*,
  not a contract. A parameter's absence there proves only that the client omits it.
- **Comment scope over-generalized.** In a schema file, a comment binds to the operation directly
  beneath it. Adjacent operations were read as sharing its rules.
- **Frame persistence.** An early "backend is half-built" framing survived contradicting evidence.
  `parentDimensionKeys` being fetched-and-discarded was rationalized as confirming the frame
  rather than treated as the disconfirming signal it was.
- **No hedging proportional to the evidence.** Both claims were stated flatly and escalated
  straight into governance recommendations, giving the owner nothing to calibrate against.

## 4. Impact

- User impact: none — no defect shipped; both errors were caught in analysis.
- Delivery impact: wasted review cycles; an epic drafted around a non-existent blocker; a
  recommendation to open an ICR and involve the backend team for work that did not exist.
- Quality impact: no code defect. The damage class is *misdirected planning* — the most expensive
  failure mode for analysis work, since the output looks like a completed deliverable.

## 5. Prevention and Guardrails

- Preventive action 1: `docs/crystord_server/schema.graphql` is the authoritative backend contract.
  Read it before asserting any backend capability or limitation. Documents under
  `src/api-contract/` describe what this client sends, never what the API supports.
- Preventive action 2: when quoting a schema rule or error code, confirm which operation it is
  attached to. Error codes in this schema are documented per-operation and do not generalize
  across neighbouring mutations.
- Preventive action 3: treat "the frontend fetches a field and never uses it" as evidence the
  backend supports more than the UI exposes — a disconfirming signal to investigate, not a detail
  to explain away.
- Preventive action 4: before recommending an ICR or backend coordination for a *missing*
  capability, grep the schema for the operation. Absence there is the only evidence that supports
  the claim.
- Verification signal: any capability claim in a review or epic cites the authoritative source
  (schema path + line) or is stated as an assumption to be checked.

## 6. What To Do Next Time

Ask "what would prove this wrong, and where does that live?" before asserting a limitation.
For backend capability, the answer is always the schema. State claims with confidence
proportional to what was actually read: "the frontend does not send X" and "the API does not
support X" are different statements, and only one of them was verified.

## 7. Cross-References

- Related epics / requirements: EPIC-260076 (hierarchical category dimensions); EPIC-260068
  (Categories navigator, which deferred re-parenting as a follow-up)
- Related ADRs: ADR-260064 (to be superseded by EPIC-260076 T1)
- Related ICRs / contracts: none — the erroneous recommendation was to open one; no interface
  change was ever required.

## 8. Status

- Status: Active
- Superseded by: N/A
