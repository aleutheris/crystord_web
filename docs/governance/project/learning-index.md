# Learnings Index

| Learning ID | Title | Category | Summary | Detailed Record | Related Backlog Items | Related ADRs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LRN-001 | Google Analytics (GA4) Setup Checklist | operations | Use the official gtag snippet verbatim; verify via the `collect` 204 hit from a clean environment, not whether `gtag/js` loads. | [LRN-001-google-analytics-ga4-setup.md](learnings/LRN-001-google-analytics-ga4-setup.md) | N/A | N/A | Active |
| LRN-002 | Verify against the authoritative contract, not adjacent artifacts | process | `docs/crystord_server/schema.graphql` is the backend contract; `src/api-contract/` documents are client selections. Twice claimed a capability was unsupported — once from a client document, once by generalizing a schema comment across operations — and recommended an unnecessary ICR. | [LRN-002-verify-against-authoritative-contract.md](learnings/LRN-002-verify-against-authoritative-contract.md) | EPIC-260076, EPIC-260068 | ADR-260064 | Active |
| LRN-003 | An empty required filter fails open — never emit one at a boundary | design | A COLLECT saved with `labels: []` matched every owned atom (vacuous AND), not none. An uncommitted chip draft, a save gate that ignored labels, and a summary that looked identical either way all had to line up — and a test asserted the defect. | [LRN-003-empty-required-filter-fails-open.md](learnings/LRN-003-empty-required-filter-fails-open.md) | EPIC-260069, REQ-FR-260073 | ADR-260027, ADR-260065 | Active |

## Tracker Rules

1. Keep this index concise; one-line summaries only.
2. Put full details in individual learning files.
3. Use stable IDs (`LRN-###`) and never reassign IDs.
4. Mark outdated learnings as `Superseded` instead of deleting history.
