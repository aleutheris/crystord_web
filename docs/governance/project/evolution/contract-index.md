# Contract Index

Registry of boundary contracts for Crystord App. One row per contract; full detail lives in the
record files under `contracts/`. Status values per
`docs/governance/generic/process/artifact-model.md`. This index is the single source of truth for
contract status — load it before opening individual contract records.

| ID | Title | Status | Record | Related | Notes |
| --- | --- | --- | --- | --- | --- |
| schema-compatibility-contract | Frontend/Backend GraphQL Schema Compatibility | Active | [schema-compatibility-contract.md](contracts/schema-compatibility-contract.md) | ADR-260013, ADR-260054, REQ-OR-260016, REQ-OR-260017, ICR-260001, ICR-260002, ICR-260081 | Live pin `~9.3.0`, ratified by ICR-260081. Companion: `contracts/deprecation-log.md`. |

## Tracking Rules

1. Keep this index synchronized with the `contracts/` folder contents.
2. Update status as contracts progress through their lifecycle.
3. On a terminal status, keep a tombstone link and move the row to a "Superseded" section, per
   `docs/governance/generic/process/artifact-model.md`.
4. Load on-demand when working with contracts.
