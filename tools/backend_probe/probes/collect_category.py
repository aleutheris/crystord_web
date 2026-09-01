#!/usr/bin/env python3
"""Probe: does a category COLLECT actually collect, end to end?

This is the question EPIC-260082 exists to answer and never could. The epic's Risks
section says it plainly: the two category queries were "verified against the schema and
user guide only, **not** against a running backend". Every one of the 2028 unit tests and
93 e2e tests mocks the response, so all of them would pass against a server that returns
nothing at all.

The probe writes a real computed atom the way the formula builder writes one —
`operation: {"name":"COLLECT","args":["<query>"]}` plus `constants` — reads it back, and
reports what the evaluator did with it. Three things are being observed:

  1. that the query resolves at all, rather than failing with OP-COLLECT-QUERY-UNKNOWN;
  2. what `content` comes back — CT-5 reference cells (`{"ref": "<uuid>"}`), and how many;
  3. for `atoms_in_category_subtree`, that descendants really are included — run it twice,
     once per query name, against a value that has children, and compare the counts. That
     difference is the entire justification for shipping two picker entries.

**This probe writes to the server.** It creates one atom titled `probe-collect-<query>`
and destroys it before exiting; pass `--keep` to leave it in place for inspection in the
UI. It never touches the taxonomy, only its own atom.

Run (keys from category_taxonomy.py — the demo taxonomy has `brand` nested under
`country`, so `country/germany` has brand descendants and is a real subtree test):
  python3 tools/backend_probe/probes/collect_category.py --dimension country --value germany
  ... --query atoms_in_category_value --dimension country --value germany
  ... --dimension country --value germany --keep
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
    causes
    properties {
      shellies { uuid }
      nuclearies { title content operation constants }
    }
  }
}
""".strip()

DESTROY_MUTATION = """
mutation Destroy($uuid: String) {
  destroy(selector: { uuid: $uuid }) { requested deleted notFound }
}
""".strip()

DEFAULT_QUERY = "atoms_in_category_subtree"

# `change` rejects an atom with no labels: `labels: []` comes back as `AC-LABELS-EMPTY`
# (observed 2026-09-01 against 9.3.0; the code appears NOWHERE in docs/user-guide.md, and
# `AtomInput.labels` is only typed `[String!]!`, which a reader would satisfy with `[]`).
# Not an app defect — the builder saves through an update that carries the atom's existing
# labels — but it means a probe cannot create a bare computed atom.
PROBE_LABEL = "backend_probe"


def _create(session: Session, query_name: str, dimension: str, value: str) -> str:
    """Write the computed atom exactly as FormulaBuilder's save path would."""
    operation = json.dumps({"name": "COLLECT", "args": [query_name]})
    constants = {"dimension_key": dimension, "value_key": value}
    print(f"probe: operation={operation}", file=sys.stderr)
    print(f"probe: constants={json.dumps(constants)}", file=sys.stderr)

    result = session.post(
        CHANGE_MUTATION,
        {
            "inputs": [{
                "labels": [PROBE_LABEL],
                "properties": {"nuclearies": {
                    "title": f"probe-collect-{query_name}",
                    "operation": operation,
                    "constants": constants,
                }},
            }],
            "remark": "backend_probe: collect_category",
        },
    )
    if result.get("errors"):
        show(result)
        raise ProbeError("The write itself was rejected — nothing to evaluate.")

    uuids = (result.get("data") or {}).get("change") or []
    if not uuids or not uuids[0]:
        raise ProbeError(f"change returned no uuid: {json.dumps(result)}")
    print(f"probe: created {uuids[0]}", file=sys.stderr)
    return uuids[0]


def _destroy(session: Session, uuid: str) -> None:
    outcome = session.post(DESTROY_MUTATION, {"uuid": uuid})
    deleted = ((outcome.get("data") or {}).get("destroy") or {}).get("deleted") or []
    if deleted:
        print(f"probe: cleaned up {deleted[0]}", file=sys.stderr)
    else:
        print(f"probe: CLEANUP FAILED for {uuid} — delete it by hand: {json.dumps(outcome)}", file=sys.stderr)


def _cells(content: object) -> list | None:
    """`content` as a cell list, or None if it is neither.

    Observed 2026-09-01 against 9.3.0: `content` is typed `JSON` in the schema but a COLLECT
    result arrives as a JSON *string* — `"[{\\"ref\\": \\"…\\"}]"` — not a parsed array. Not
    an app defect: `normalizeAtomContent` (`src/api-contract/graph-queries.ts:151-173`)
    already pins `content` to a string at the network boundary for exactly this reason. It
    does mean the UI shows a computed list as raw JSON text, which is EPIC-260069 behaviour,
    not something EPIC-260082 changed.
    """
    if isinstance(content, list):
        return content
    if isinstance(content, str):
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, list) else None
    return None


def _report(atom: dict, query_name: str) -> None:
    status = atom.get("evaluationStatus")
    code = atom.get("errorCode")
    content = ((atom.get("properties") or {}).get("nuclearies") or {}).get("content")

    print(f"probe: evaluationStatus={status} errorCode={code}", file=sys.stderr)
    if status != "success":
        print(f"probe: {query_name} FAILED to evaluate — causes={atom.get('causes')}", file=sys.stderr)
        return

    cells = _cells(content)
    if cells is None:
        print(f"probe: content is neither a list nor JSON text — {json.dumps(content)}", file=sys.stderr)
        return

    refs = [cell for cell in cells if isinstance(cell, dict) and "ref" in cell]
    print(f"probe: {query_name} collected {len(refs)} atom(s).", file=sys.stderr)
    if len(refs) != len(content):
        print(
            f"probe:   NOTE {len(content) - len(refs)} cell(s) are not CT-5 refs — "
            "the client assumes every COLLECT cell is a reference.",
            file=sys.stderr,
        )
    if not refs:
        print(
            "probe:   EMPTY, and it SUCCEEDED — this is the silent-empty outcome the "
            "ownership gate exists to prevent. Check the value resolves and you own it.",
            file=sys.stderr,
        )


def probe(session: Session) -> None:
    query_name = session.flag("--query", DEFAULT_QUERY)
    dimension = session.flag("--dimension")
    value = session.flag("--value")
    if not dimension or not value:
        raise ProbeError("Need --dimension KEY and --value KEY (see category_taxonomy.py to list them).")

    uuid = _create(session, query_name, dimension, value)
    try:
        result = session.post(RETRIEVE_QUERY, {"uuid": uuid})
        show(result)
        atoms = (result.get("data") or {}).get("retrieve") or []
        if atoms:
            _report(atoms[0], query_name)
        else:
            print("probe: retrieve returned no atom for the uuid just written.", file=sys.stderr)
    finally:
        if "--keep" in session.args:
            print(f"probe: --keep, leaving {uuid} on the server.", file=sys.stderr)
        else:
            _destroy(session, uuid)


if __name__ == "__main__":
    raise SystemExit(run(probe))
