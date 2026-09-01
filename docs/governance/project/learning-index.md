# Learnings Index

| Learning ID | Title | Category | Summary | Detailed Record | Related Backlog Items | Related ADRs | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LRN-001 | Google Analytics (GA4) Setup Checklist | operations | Use the official gtag snippet verbatim; verify via the `collect` 204 hit from a clean environment, not whether `gtag/js` loads. | [LRN-001-google-analytics-ga4-setup.md](learnings/LRN-001-google-analytics-ga4-setup.md) | N/A | N/A | Active |
| LRN-002 | Verify against the authoritative contract, not adjacent artifacts | process | `docs/crystord_server/schema.graphql` is the backend contract; `src/api-contract/` documents are client selections. Twice claimed a capability was unsupported — once from a client document, once by generalizing a schema comment across operations — and recommended an unnecessary ICR. | [LRN-002-verify-against-authoritative-contract.md](learnings/LRN-002-verify-against-authoritative-contract.md) | EPIC-260076, EPIC-260068 | ADR-260064 | Active |
| LRN-003 | An empty required filter fails open — never emit one at a boundary | design | Verify what "empty" means at a boundary; do not assume the backend rejects a degenerate filter. Against the pre-9.3.0 backend a COLLECT saved with `labels: []` matched every owned atom (vacuous AND), not none. **That specific hazard is closed** — 9.3.0 rejects empty required constants (`user-guide.md:1305`) — the lesson is not. | [LRN-003-empty-required-filter-fails-open.md](learnings/LRN-003-empty-required-filter-fails-open.md) | EPIC-260069, EPIC-260082, REQ-FR-260073, ICR-260081 | ADR-260027, ADR-260065 | Active |
| LRN-004 | A bare trailing count badge reads as part of the name — worst at zero | design | `CategoryTree`'s "style-neutral" count badge rendered with no separator from the label, so `atomCount` glued onto `displayName` (e.g. `Tesla0`) whenever a consumer skipped `classNames` — both did. Fixed by rendering `(N)` in the widget itself instead of deferring legibility to caller CSS. | [LRN-004-bare-count-badge-reads-as-part-of-name.md](learnings/LRN-004-bare-count-badge-reads-as-part-of-name.md) | EPIC-260067, EPIC-260068 | ADR-260061, ADR-260064, ADR-260071 | Active |

## Tracker Rules

1. Keep this index concise; one-line summaries only.
2. Put full details in individual learning files.
3. Use stable IDs (`LRN-###`) and never reassign IDs.
4. Mark outdated learnings as `Superseded` instead of deleting history.
