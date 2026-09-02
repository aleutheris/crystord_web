# Crystord App — Project Instructions (Instantiation)

Instantiated from `docs/governance/generic/process/project-instructions.md`. This file holds
project instantiation details only; foundational policy lives in the generic governance tree
(do not duplicate it here).

## Source of Truth (Do Not Duplicate)

- Foundation policy and agent behavior: `docs/governance/generic/process/framework.md`
- Engineering depth (SOLID, taxonomy, verification): `docs/governance/generic/process/framework-reference.md`
- Record model, naming, indexing, archival: `docs/governance/generic/process/artifact-model.md`
- Epic/task planning policy: `docs/governance/generic/process/epic-process.md`
- Interface approval workflow template: `docs/governance/generic/templates/interface-change-request.template.md`

## 1. Project Profile

- Project name: `Crystord App`
- Governance version: `v2.0.0` (adopted from `docs/governance/CHANGELOG.md`)
- Goal: Build a frontend project against the existing backend contract.
- Primary users: Data managers and domain operators who require transparent data and relationship visibility.
- Constraints: Must honor the backend contract and domain guide while remaining independent from the
  current frontend implementation, and must apply the branding policy defined in
  `docs/governance/project/branding.md` for all UI/design-facing changes.

## 2. Architecture Instantiation

- Major modules and responsibilities: `auth-entry` (demo sign-in and entry guard), `workspace-graph` (canvas interactions and graph rendering), `workspace-search` (bootstrap and label-driven scoping), `workspace-details` (side-panel edit flows), `api-contract` (GraphQL bindings/adapters/compatibility checks), `ui-shell` (routing/layout/navigation shell), `ui-primitives` (shared template library — typed prop contracts and barrel exports for reusable UI primitives).
- Module ownership map: Repository owner owns all modules in MVP; ownership split can be introduced Post-MVP by module boundary.
- Allowed dependency directions: `ui-shell` composes feature modules; feature modules may depend on `ui-primitives`, shared utilities, and `api-contract`; feature modules must not import other feature internals; `ui-primitives` must not import from any feature module.
- Shared leaf modules: `src/a11y/` (modal focus management) and `src/help/` (in-app help content types plus the core-concepts copy) import nothing and may be imported by both `ui-shell` and feature modules. `src/help/` exists specifically so a feature can author its own surface's help without importing `ui-shell` (ADR-260085).
- Boundary contract catalog: Backend API/schema contract, internal module APIs, configuration contracts, `ui-primitives` prop contracts.
- Behavior-oriented slicing plan: Vertical slices by capability: entry/auth, graph interaction, search/discovery, details editing, API-contract integration. Within each feature slice, `use-*.ts` hooks own behavior and components own presentation — established practice in `workspace-graph`, standard for all new slices.
- UI Primitives template library: `src/ui-primitives/` hosts typed prop contracts for buttons, inputs, selection controls, feedback, layout, and typography. Path alias `@ui/*` resolves to this directory. New templates are added per the `CATALOG.md` convention guide (ADR-260051).

## 3. Interface Governance Instantiation

- Project-specific approval authority: Repository owner.
- Required approval SLA: Target response within 48 hours for ICR decisions.
- Contract versioning strategy: Backend-facing contract pinned to an approved version; internal interfaces require explicit approval when broken.
- ICR storage location: `docs/governance/project/evolution/icr/`

All contract changes must use `docs/governance/generic/templates/interface-change-request.template.md`.

## 4. Verification Instantiation

- Critical end-to-end flows: Demo sign-in entry, bootstrap search graph load, atom create/edit persistence, bond create/name persistence, delete safety behavior (confirm/undo), and error-path resilience without app crash.
- Required boundary contracts to test: Backend contract integration, internal module boundaries.
- Integration points with highest failure risk: `schemaInfo` startup compatibility handshake, mutation persistence and adapter mapping, route guard/auth entry behavior, graph interaction state synchronization.
- Component/service checks: api-contract adapters and schema policy checks, graph canvas action handlers, search-to-graph scoping integration, detail panel mutation orchestration.
- Optional unit-test focus areas: Adapter mappers, validation logic, and pure state transitions with non-trivial branching.
- Branding compliance checks: UI copy, color semantics, and interaction states align with `docs/governance/project/branding.md`.

## 5. Delivery Instantiation

- Branching constraints: Direct-to-main workflow with small, reversible commits.
- CI gates and blocking checks: ESLint, strict TypeScript type checks, Vitest suite, contract/integration checks for backend compatibility boundaries, and smoke-level E2E checks for critical flows.
- Rollback strategy: Redeploy last-known-good artifact, run immediate smoke verification, and preserve diagnostics from failed release attempt.
- Observability minimum: Structured client logs, contextual error events (route/action/API), and baseline metrics for workspace load, bootstrap search latency, mutation outcomes, schema-compatibility failures, and demo sign-in failures.
- Commit behavior guidance: commit to `main` whenever needed; for higher-risk changes, run selected quality checks before commit.

## 6. Quality Gate Instantiation

Requirement taxonomy and record naming follow `framework-reference.md` §2 and `artifact-model.md`
— record the project-specific decisions only:

- Requirement ID allocation: Repository owner assigns `REQ-FR/QR/OR/CR` records; automation welcome.
- Portability acceptance checks: MVP runs in modern desktop browsers and uses environment-driven backend endpoint/configuration without hardcoded environment values.
- Maintainability acceptance checks: File <= 200 lines, function <= 30 lines.
- Observability acceptance checks: Required logs/events/metrics are emitted for critical flows and compatibility/auth failures with actionable diagnostic context.
- Contract-stability checks: Backend contract compatibility validated before release.
- Readability and documentation checks: No dead code, no unused imports, meaningful naming.
- In-app help freshness checks (ADR-260085): a change that alters what a registered surface
  (center view, inspector tab, navigator lens) means or does — **including renaming it** — should
  diff that surface's help copy in the same commit. Sources: `src/features/<module>/help.ts`,
  `src/ui-shell/labels-navigator-help.ts`, and `src/help/concepts.ts`. The required `help` field
  catches a *missing* surface at compile time; nothing catches a section that has become untrue,
  so this is a human check and is stated as one.
- Branding acceptance checks: UI and design changes map to brand tokens/semantics and do not violate branding constraints in `docs/governance/project/branding.md`.

Code cohesion defaults (required unless explicitly overridden with rationale):

- File size guardrail: `<= 200 lines`.
- Function size guardrail: `<= 30 lines where practical`.

## 7. Stack Addendum

- Language and runtime: TypeScript with browser CSR runtime; Node.js LTS toolchain for build/test workflows.
- Frameworks and platform: React, React Router, Apollo Client, React Flow (or equivalent editor-grade graph library), React Hook Form with schema validation, and utility/headless UI primitives.
- Data/storage: GraphQL backend via Apollo client/cache plus lightweight local workspace state store; no client-side persistent database in MVP.
- Infrastructure/deployment: Single frontend application artifact with environment-based configuration and versioned deploy/rollback process.

## 8. Evolution Tracking

Instantiate the artifact structure defined in `artifact-model.md`. Under
`docs/governance/project/evolution/`: `adr/` + `adr-index.md`, `requirements/` +
`requirement-index.md`, `icr/` + `icr-index.md`, `contracts/` + `contract-index.md`, `epics/` +
`epic-index.md`, and `roadmap.md`. Under `docs/governance/project/learnings/`: the learnings folder
+ `learning-index.md`. Naming, the index-first rule, and the archival lifecycle follow
`artifact-model.md`.

Project-specific instantiation:

- Decision cadence: Per-major-decision (ADR for each checklist resolution).
- Review cadence for project instructions: After MVP scope is locked, then per-milestone.
- Requirement ID allocation: Repository owner assigns; automation welcome.
- Epic ownership: Repository owner writes and maintains epics and their task checklists.

> Note: planning history before governance v2.0.0 is preserved as frozen `BI-*` records under
> `evolution/epics/` (see `epic-index.md`). New planning uses `EPIC-YYNNNN`.

## 9. Loading Matrix Instantiation

Tiers and budget guardrails follow `framework.md` §8 — named per tier below.

Always-on (mandatory):
- `docs/governance/README.md`
- `docs/governance/generic/process/framework.md`
- `docs/governance/project/project-instructions.md`
- `docs/governance/project/branding.md`

Usually referenced:
- `docs/governance/generic/process/framework-reference.md`
- `docs/governance/generic/process/epic-process.md`
- `docs/governance/project/evolution/requirement-index.md`
- `docs/governance/project/evolution/epic-index.md`
- `docs/governance/project/evolution/adr-index.md`

On-demand:
- `docs/governance/project/evolution/requirements/*`
- `docs/governance/project/evolution/adr/*`
- `docs/governance/project/evolution/epics/*`
- `docs/governance/project/evolution/icr/*` + `icr-index.md`
- `docs/governance/project/evolution/contracts/*` + `contract-index.md`
- `docs/governance/project/evolution/roadmap.md`
- `docs/governance/project/learnings/*` + `learning-index.md`
- `docs/backend-user-guide.md`
