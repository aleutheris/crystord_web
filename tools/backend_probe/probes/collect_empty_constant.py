#!/usr/bin/env python3
"""Probe: does an empty required COLLECT constant fail loudly, or match everything?

This single behaviour is load-bearing for four governance records. LRN-003 documents a
field defect where a COLLECT saved with `labels: []` matched **every owned atom** (a
vacuous AND) instead of none. EPIC-260082's fifth review round then found that schema
9.3.0 had closed that at the source, and rewrote the rationale in `operation-metadata.ts`,
`collect-constants.ts`, REQ-FR-260073, LRN-003 §7-8 and ICR-260081 on the strength of one
sentence of prose:

  "A required key that is absent fails the evaluation with OP-COLLECT-CONSTANTS-MISSING;
   one that is present but invalid — empty (`[]`, `{}`, `""`, `null`), of the wrong type,
   or below the declared minimum item count — fails with OP-COLLECT-CONSTANTS-INVALID. In
   both cases no query runs and no rows are returned — an empty filter never means 'match
   everything'."                                              (user-guide.md:1305)

Nothing has ever observed it. The builder blocks empty constants client-side, so the app
cannot reach this path — which is exactly why the server's behaviour here is unverified
and worth measuring directly.

  - `--case empty-value` (default) — `value_key: ""`, expect OP-COLLECT-CONSTANTS-INVALID
  - `--case missing-value`         — omit `value_key`, expect OP-COLLECT-CONSTANTS-MISSING
  - `--case empty-labels`          — `labels: []`, the original LRN-003 defect
  - `--case unknown-query`         — a query name nobody registered, expect
                                     OP-COLLECT-QUERY-UNKNOWN (the one code the app can
                                     still reach, via the ungated free-text query box)

**A non-empty `content` on any of these is a serious finding**: it means 9.3.0 did NOT
close the LRN-003 hazard, and the round-five correction is wrong in the opposite
direction — the records would need reverting, not amending.

**This probe writes to the server.** One atom per run, destroyed before exit unless
`--keep`.

Run:
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/collect_empty_constant.py
  ... --case empty-labels
  ... --case missing-value
"""

from __future__ import annotations

import json
import sys

from _bootstrap import ProbeError, Session, run, show

CHANGE_MUTATION = """
mutation Change($inputs: [AtomInput]!, $remark: String) {
  change(inputs: $inputs, remark: $remark)
}
""".strip()

RETRIEVE_QUERY = """
query Retrieve($uuid: String) {
  retrieve(uuid: $uuid) {
    evaluationStatus
    errorCode
    properties {
      shellies { uuid }
      nuclearies { content operation constants }
    }
  }
}
""".strip()

DESTROY_MUTATION = """
mutation Destroy($uuid: String) {
  destroy(selector: { uuid: $uuid }) { requested deleted notFound }
}
""".strip()

# `change` rejects `labels: []` with `AC-LABELS-EMPTY` — an undocumented code (observed
# 2026-09-01 against 9.3.0; it appears nowhere in docs/user-guide.md). Unrelated to the
# COLLECT `labels` CONSTANT this probe is testing; the atom just needs one label to exist.
PROBE_LABEL = "backend_probe"

# case -> (collect query name, constants map, the code user-guide.md:1305 predicts)
CASES = {
    "empty-value": ("atoms_in_category_subtree", {"dimension_key": "x", "value_key": ""}, "OP-COLLECT-CONSTANTS-INVALID"),
    "missing-value": ("atoms_in_category_subtree", {"dimension_key": "x"}, "OP-COLLECT-CONSTANTS-MISSING"),
    "empty-labels": ("atoms_with_labels", {"labels": []}, "OP-COLLECT-CONSTANTS-INVALID"),
    "unknown-query": ("atoms_no_such_query", {"labels": ["probe"]}, "OP-COLLECT-QUERY-UNKNOWN"),
}


def _create(session: Session, case: str, query_name: str, constants: dict) -> str:
    operation = json.dumps({"name": "COLLECT", "args": [query_name]})
    print(f"probe: case={case} operation={operation}", file=sys.stderr)
    print(f"probe: constants={json.dumps(constants)}", file=sys.stderr)

    result = session.post(
        CHANGE_MUTATION,
        {
            "inputs": [{
                "labels": [PROBE_LABEL],
                "properties": {"nuclearies": {
                    "title": f"probe-collect-{case}",
                    "operation": operation,
                    "constants": constants,
                }},
            }],
            "remark": f"backend_probe: collect_empty_constant {case}",
        },
    )
    if result.get("errors"):
        show(result)
        # Rejection at WRITE time is itself a finding: the guide describes these as
        # evaluation failures, which implies the write is accepted.
        raise ProbeError(
            "Rejected at write time, not evaluation time — the guide describes these as "
            "evaluation failures (user-guide.md:1305). That difference matters to the app: "
            "a write rejection surfaces as a save error, not as a red badge."
        )

    uuids = (result.get("data") or {}).get("change") or []
    if not uuids or not uuids[0]:
        raise ProbeError(f"change returned no uuid: {json.dumps(result)}")
    return uuids[0]


def _report(atom: dict, expected_code: str) -> None:
    status = atom.get("evaluationStatus")
    code = atom.get("errorCode")
    content = ((atom.get("properties") or {}).get("nuclearies") or {}).get("content")
    rows = len(content) if isinstance(content, list) else None

    print(f"probe: evaluationStatus={status} errorCode={code} rows={rows}", file=sys.stderr)

    if rows:
        print(
            f"probe: *** {rows} ROW(S) RETURNED for an empty/invalid filter. user-guide.md:1305 "
            "says no query runs and no rows are returned. If this holds, 9.3.0 did NOT close the "
            "LRN-003 hazard and the round-five correction must be REVERTED, not amended. ***",
            file=sys.stderr,
        )
        return

    if code == expected_code:
        print(f"probe: OK — {expected_code} as documented, no rows.", file=sys.stderr)
    elif code:
        print(
            f"probe: fails loudly but with {code}, not the documented {expected_code}. "
            "The hazard is closed; the code mapping in compute-status.ts / ExplainSection.tsx "
            "may name the wrong one.",
            file=sys.stderr,
        )
    else:
        print(
            f"probe: no rows, but no errorCode either (status={status}). The user would see a "
            "computed atom that is simply empty, with nothing to explain why.",
            file=sys.stderr,
        )


def probe(session: Session) -> None:
    case = session.flag("--case", "empty-value")
    if case not in CASES:
        raise ProbeError(f"Unknown --case {case}. Choose one of: {', '.join(CASES)}")
    query_name, constants, expected_code = CASES[case]

    uuid = _create(session, case, query_name, constants)
    try:
        result = session.post(RETRIEVE_QUERY, {"uuid": uuid})
        show(result)
        atoms = (result.get("data") or {}).get("retrieve") or []
        if atoms:
            _report(atoms[0], expected_code)
        else:
            print("probe: retrieve returned no atom for the uuid just written.", file=sys.stderr)
    finally:
        if "--keep" in session.args:
            print(f"probe: --keep, leaving {uuid} on the server.", file=sys.stderr)
        else:
            outcome = session.post(DESTROY_MUTATION, {"uuid": uuid})
            deleted = ((outcome.get("data") or {}).get("destroy") or {}).get("deleted") or []
            print(
                f"probe: cleaned up {deleted[0]}" if deleted
                else f"probe: CLEANUP FAILED for {uuid} — delete it by hand.",
                file=sys.stderr,
            )


if __name__ == "__main__":
    raise SystemExit(run(probe))
