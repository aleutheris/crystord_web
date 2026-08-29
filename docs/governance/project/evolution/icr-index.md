# ICR Index

Append-only audit log of interface change requests (ICRs) for Crystord App. `Open` requests are
listed first. Status values per `docs/governance/generic/process/artifact-model.md`. ICRs are
never moved or deleted; an approved ICR's effect lands in the contract it modifies.

| ID | Title | Status | Record | Related | Notes |
| --- | --- | --- | --- | --- | --- |
| ICR-260081 | Adopt backend schema 9.3.0 (`backendSchemaRange ~9.3.0`) | Implemented | [ICR-260081.md](icr/ICR-260081.md) | schema-compatibility-contract, ICR-260002, backend ICR-260018 | Approved + implemented 2026-08-29; supersedes the `~9.2.0` pin. Net 9.2.0→9.3.0 delta is additive-only; unlike ICR-260002 it *does* touch a consumed type (`OperationFunction`), but only by adding return fields the frontend does not select. Required, not optional: all production servers run 9.3.0. Verified 1922 unit / 92 e2e green. Not to be confused with backend `BI-260081`. |
| ICR-260002 | Adopt backend schema 9.2.0 (`backendSchemaRange ~9.2.0`) | Implemented | [ICR-260002.md](icr/ICR-260002.md) | schema-compatibility-contract, ADR-260050, BI-260081 (backend) | Approved 2026-06-29; ratifies the already-shipped `~9.2.0` pin (commit `af96479`). Net 8.1.0→9.2.0 delta is additive-only and outside the frontend's used surface. |
| ICR-260001 | Adopt backend schema 8.1.0 (`backendSchemaRange ~8.1.0`) | Implemented | [ICR-260001.md](icr/ICR-260001.md) | schema-compatibility-contract, ADR-260054, REQ-OR-260016, REQ-OR-260017 | Status asserted `Implemented` (the record carries no `Status:` field): 8.1.0 was adopted and shipped. |

## Tracking Rules

1. Keep this index synchronized with the `icr/` folder contents.
2. Update status as ICRs progress: `Open → Approved → Implemented`; `Rejected` / `Withdrawn` are terminal.
3. Never delete a row; ICRs are an append-only audit log.
4. Load on-demand when proposing or reviewing a contract change.
