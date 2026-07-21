# Learnings Index

| Learning ID | Title | Category | Summary | Detailed Record | Related Backlog Items | Related ADRs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LRN-001 | Google Analytics (GA4) Setup Checklist | operations | Use the official gtag snippet verbatim; verify via the `collect` 204 hit from a clean environment, not whether `gtag/js` loads. | [LRN-001-google-analytics-ga4-setup.md](learnings/LRN-001-google-analytics-ga4-setup.md) | N/A | N/A | Active |
| LRN-002 | Verify against the authoritative contract, not adjacent artifacts | process | `docs/crystord_server/schema.graphql` is the backend contract; `src/api-contract/` documents are client selections. Twice claimed a capability was unsupported — once from a client document, once by generalizing a schema comment across operations — and recommended an unnecessary ICR. | [LRN-002-verify-against-authoritative-contract.md](learnings/LRN-002-verify-against-authoritative-contract.md) | EPIC-260076, EPIC-260068 | ADR-260064 | Active |

## Tracker Rules

1. Keep this index concise; one-line summaries only.
2. Put full details in individual learning files.
3. Use stable IDs (`LRN-###`) and never reassign IDs.
4. Mark outdated learnings as `Superseded` instead of deleting history.
