#!/usr/bin/env python3
"""Probe: is MINUS/DIVIDE really two-argument, and does the builder truncate if not?

`discover_operations.py` found the backend contradicting itself. Its machine-readable
metadata says both are unbounded:

    MINUS   arity 2..∞   numericOnly        (discoverOperations, schema 9.3.0)
    DIVIDE  arity 2..∞   numericOnly

while its own prose says the opposite:

    "**Arguments:** exactly two atom UUID references or constant keys, both numeric."
                                          (user-guide.md:1243 for MINUS, :1283 for DIVIDE)

The client sided with the prose: `BUILTIN_OPERATIONS` declares `{min: 2, max: 2}`. That
choice is not free. `fitRows` (`FormulaBuilder.tsx`) trims rows above `max` on MOUNT —
`rows.slice(0, bounds.max)` — so if the server really does accept three arguments, then
opening an existing three-argument MINUS in the formula builder silently drops the third
slot, and saving writes the truncated formula back. Losing an operand without saying so is
the same silent-data-loss class EPIC-260082's round-three finding was about, one operation
over.

So this probe settles which half of the contract is true, by sending a three-argument
MINUS built from constants and reading back what the evaluator does:

  - evaluates (e.g. 10-3-2 = 5)  → the metadata is right, the guide is stale, and the
                                    client has a real truncation bug on edit.
  - fails with an arity error    → the guide is right and the published metadata is wrong;
                                    the client is safe, but `maxArity` cannot be trusted
                                    by any client that starts reading it (which is
                                    EPIC-260082's recorded follow-up).

**This probe writes to the server.** One atom, destroyed before exit unless `--keep`.

Run:
  python3 tools/backend_probe/probes/operation_arity.py
  python3 tools/backend_probe/probes/operation_arity.py --op DIVIDE
  python3 tools/backend_probe/probes/operation_arity.py --op SUM --args 4
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
    properties { nuclearies { content operation constants } }
  }
}
""".strip()

DESTROY_MUTATION = """
mutation Destroy($uuid: String) {
  destroy(selector: { uuid: $uuid }) { requested deleted notFound }
}
""".strip()

PROBE_LABEL = "backend_probe"
# Distinct values so the result identifies which operands were actually consumed:
# MINUS over all three is 5; over the first two only, 7.
OPERANDS = [10, 3, 2, 1, 1, 1, 1, 1]
# What BUILTIN_OPERATIONS claims, restated by hand — see collect_queries.py for why.
CLIENT_MAX = {"SUM": None, "MINUS": 2, "PRODUCT": None, "DIVIDE": 2, "COLLECT": 1}


def probe(session: Session) -> None:
    op = session.flag("--op", "MINUS").upper()
    count = int(session.flag("--args", "3"))
    if count > len(OPERANDS):
        raise ProbeError(f"--args at most {len(OPERANDS)}")

    keys = [f"n{i}" for i in range(count)]
    constants = {key: OPERANDS[i] for i, key in enumerate(keys)}
    operation = json.dumps({"name": op, "args": keys})
    client_max = CLIENT_MAX.get(op, "unknown")
    print(f"probe: {op} with {count} args; client's table allows max={client_max}", file=sys.stderr)
    print(f"probe: operation={operation} constants={json.dumps(constants)}", file=sys.stderr)

    created = session.post(
        CHANGE_MUTATION,
        {
            "inputs": [{
                "labels": [PROBE_LABEL],
                "properties": {"nuclearies": {
                    "title": f"probe-arity-{op}-{count}",
                    "operation": operation,
                    "constants": constants,
                }},
            }],
            "remark": "backend_probe: operation_arity",
        },
    )
    if created.get("errors"):
        show(created)
        print(
            f"probe: rejected at WRITE time — the server enforces {op}'s arity before storing.",
            file=sys.stderr,
        )
        return

    uuid = ((created.get("data") or {}).get("change") or [None])[0]
    if not uuid:
        raise ProbeError(f"change returned no uuid: {json.dumps(created)}")

    try:
        result = session.post(RETRIEVE_QUERY, {"uuid": uuid})
        show(result)
        atoms = (result.get("data") or {}).get("retrieve") or []
        if not atoms:
            print("probe: retrieve returned no atom.", file=sys.stderr)
            return
        atom = atoms[0]
        status = atom.get("evaluationStatus")
        code = atom.get("errorCode")
        content = ((atom.get("properties") or {}).get("nuclearies") or {}).get("content")
        print(f"probe: evaluationStatus={status} errorCode={code} content={json.dumps(content)}", file=sys.stderr)

        if status == "success" and isinstance(client_max, int) and count > client_max:
            print(
                f"probe: *** {op} EVALUATED with {count} args, but the client's table caps it at "
                f"{client_max}. fitRows trims to max on MOUNT, so opening this atom in the formula "
                f"builder drops operand(s) {keys[client_max:]} from the UI and saving writes the "
                f"truncated formula back — silent data loss on edit. ***",
                file=sys.stderr,
            )
        elif status != "success":
            print(
                f"probe: rejected at EVALUATION time ({code}) — the guide's 'exactly two' holds and "
                f"discoverOperations' maxArity=null is wrong. The client is safe; the published "
                f"metadata is not trustworthy for a client that starts reading it.",
                file=sys.stderr,
            )
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
