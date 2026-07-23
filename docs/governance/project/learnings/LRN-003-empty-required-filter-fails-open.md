# Learning Record: LRN-003 An empty required filter fails open — never emit one at a boundary

## 1. Context

- Date discovered: 2026-07-23
- Discovered by: Project owner, from a field report (atom content held far more references than expected)
- Area: Compute formula builder (`src/features/workspace-compute/`), shared chip editors
  (`src/ui-primitives/widgets/LabelChipEditor.tsx`), backend `COLLECT` / `atoms_with_labels`
- Trigger: A COLLECT authored through the UI produced a collect-everything result; the same
  formula authored through direct Python API calls produced the correct set

## 2. What Happened

A user created an atom, opened Compute, chose `COLLECT` → `atoms_with_labels`, entered the label,
and saved. The saved atom's content listed far more atom references than the label should match.
The identical operation issued directly against the GraphQL API was correct, which located the
fault on the client.

The atom's stored constants were `{"labels": []}`. The backend ANDs the requested labels, so an
empty list is **vacuously true** — it matched every atom the caller owns rather than none. The
filter did not return the wrong subset; it returned a strict superset of everything.

Three independent gaps had to line up, and all three did:

1. `LabelChipEditor` commits a chip only on `Enter`. The typed label was still draft text when
   the user clicked **Save formula**, so it was silently discarded.
2. `FormulaBuilder`'s save gate checked only that the collect *query name* was non-empty. Zero
   labels saved happily — and a unit test asserted that behavior as correct.
3. The formula summary rendered `COLLECT(atoms_with_labels)` whether labels were present or
   empty, so nothing on screen distinguished a filtered formula from an unfiltered one. (It also
   ran the query name through the atom-reference shortener, displaying `atoms_wi…`.)

Gap 1 created the empty list, gap 2 let it through, gap 3 made the result invisible afterwards.

## 3. Why It Happened

- **An empty collection was treated as a no-op instead of as a wildcard.** The client assumed
  "no labels" meant "no constraint applied, harmless". At this boundary it means "match
  everything" — the most destructive possible reading. Fold-over-AND semantics make the empty
  case maximally permissive, not minimally.
- **An existing decision was not applied to a new surface.** ADR-260027 D2 already decided this
  exact problem for search: uncommitted input text is auto-chipped before submission, and its
  recorded rationale is verbatim our failure — "results in an implicit search with all atoms (as
  if no labels were specified)". `DetailPanel` implements the same guard for atom creation via
  its `effectiveLabels` pattern. The compute surface inherited neither. The decision was
  scoped to the component that prompted it rather than to the class of problem.
- **The backend's required-constant contract is unenforceable by clients.** `discoverOperations`
  returns `{name, description}` only — no arity, no arg kinds, no required constants. Every
  client must hardcode which constants a collect query needs, so the validation exists only if
  someone remembers to write it. Nobody did.
- **The server accepted an invalid document.** `atoms_with_labels` documents `labels` as
  required, yet `[]` was accepted and executed as a wildcard rather than rejected.
- **A test encoded the defect.** `FormulaBuilder.test.tsx` asserted `onSave(..., {labels: []})`,
  so the suite actively protected the bug.

## 4. Impact

- User impact: medium — silent data corruption. Computed atoms were written with wrong content
  and no error, no badge, and no visible difference in the formula line. Point-in-time COLLECT
  semantics mean the bad content persists until the formula is re-evaluated.
- Delivery impact: a field investigation that started from "extract the database and diff the
  rows". One `retrieve` of the affected atom's `constants` discriminated every hypothesis
  instead, which is the cheaper cut whenever a UI path and an API path disagree.
- Quality impact: defect class is *fail-open validation at a trust boundary*, not a logic error.
  Scope: any COLLECT authored through the builder without pressing Enter on the label.

## 5. Prevention and Guardrails

- Preventive action 1: **Never send an empty required collection across a boundary.** If a
  parameter is required, an empty value is a validation failure, not a default. Block the
  action with a stated reason.
- Preventive action 2: when a filter parameter can degrade to "no constraint", establish which
  way it fails before relying on it. Assume fail-open until proven fail-closed — check the
  operation's semantics, not the field's nullability.
- Preventive action 3: any input that requires an explicit commit gesture (Enter to chip, blur
  to apply) must fold its pending draft into the submitted value. The in-repo pattern is
  `DetailPanel`'s `effectiveLabels`; the decision is ADR-260027 D2.
- Preventive action 4: a summary or read-back view must render the parameters that change the
  result. If two materially different formulas display identically, the display is a defect.
- Preventive action 5: when an accepted ADR solves a class of problem, check the other surfaces
  in that class rather than only the one that prompted it.
- Verification signal: unit tests assert both that the guarded save is blocked and that a
  typed-but-un-Entered draft is still included. Coverage on `workspace-compute` remains 100%
  line + branch.

## 6. What To Do Next Time

When a UI path and a direct API path disagree, do not diff the data — read back the record the
UI wrote and compare the *input document*, field by field, against what the API path sends. The
divergence is in the request, and one read locates it.

When reviewing any filter, query, or bulk operation, ask: "what does this do when the parameter
list is empty?" If the answer is "everything", that path needs a guard before it ships.

## 7. Cross-References

- Related epics / requirements: REQ-FR-260073 (amended 2026-07-23 with the non-empty-constant,
  draft-commit, and summary-visibility criteria); EPIC-260069 (delivered the builder)
- Related ADRs: ADR-260027 D2 (auto-chip uncommitted text — the decision that already covered
  this and was not applied here); ADR-260065 (client-side operation metadata table, whose
  recorded drift risk this realizes)
- Related ICRs / contracts: none opened. Backend-side asks identified but not yet filed —
  reject empty required constants rather than executing them as a wildcard, and extend
  `discoverOperations` with machine-readable arity / arg-kind / required-constant metadata so
  clients can generate this validation instead of hardcoding it.

## 8. Status

- Status: Active
- Superseded by: N/A
