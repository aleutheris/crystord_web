#!/usr/bin/env python3
"""Probe: what arity metadata does the server publish, and where does the client's table differ?

`DISCOVER_OPERATIONS_QUERY` (`src/api-contract/compute-operations.ts`) selects only
`name` and `description`. Schema 9.3.0 also publishes `minArity`, `maxArity` and
`numericOnly` on `OperationFunction` (`schema.graphql:77-85`), which EPIC-260082
deliberately did not consume — reading them widens the used surface inside the pinned
schema. The builder therefore pairs discovery with `BUILTIN_OPERATIONS`, a hand-written
arity table, and the epic recorded the consequence (finding 10): an operation the server
registers but that table omits falls to `argBounds`'s permissive `{ min: 0 }` fallback,
so the builder will happily save `args: []` for an operation whose real `minArity` is
higher, and `numericOnly` is never enforced anywhere.

That consequence has only ever been reasoned about. This probe measures it: it asks the
server for the metadata the client refuses to select, and names every operation where the
two disagree. A non-empty "unknown to the client" list is the recorded risk, realised.

EXPECTED restates `BUILTIN_OPERATIONS` by hand — see `collect_queries.py` for why a probe
must never import the belief it is testing.

Run:
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/discover_operations.py
"""

from __future__ import annotations

import sys

from _bootstrap import Session, run, show

DISCOVER_OPERATIONS_QUERY = """
query DiscoverOperations {
  discoverOperations {
    name
    description
    minArity
    maxArity
    numericOnly
  }
}
""".strip()

# src/features/workspace-compute/operation-metadata.ts BUILTIN_OPERATIONS, restated by hand.
# None = unbounded, matching the schema's `maxArity: Int` (null = variadic).
EXPECTED = {
    "SUM": (1, None),
    "MINUS": (2, 2),
    "PRODUCT": (2, None),
    "DIVIDE": (2, 2),
    "COLLECT": (1, 1),
}


def _compare(operations: list) -> list:
    findings = []
    served = {op["name"]: op for op in operations}

    for name, (min_arity, max_arity) in EXPECTED.items():
        op = served.get(name)
        if op is None:
            findings.append(f"{name}: in the client's arity table, NOT registered on the server")
            continue
        if (op["minArity"], op["maxArity"]) != (min_arity, max_arity):
            findings.append(
                f"{name}: client assumes min={min_arity} max={max_arity}, "
                f"server says min={op['minArity']} max={op['maxArity']}"
            )

    for name, op in served.items():
        if name not in EXPECTED:
            findings.append(
                f"{name}: registered on the server, absent from the client's table — "
                f"falls to the permissive {{min: 0}} fallback, so the builder would save "
                f"args: [] against a real minArity of {op['minArity']}"
            )
    return findings


def probe(session: Session) -> None:
    result = session.post(DISCOVER_OPERATIONS_QUERY)
    show(result)

    operations = (result.get("data") or {}).get("discoverOperations")
    if operations is None:
        return

    print(f"probe: server registers {len(operations)} operation(s).", file=sys.stderr)
    for op in operations:
        bounds = f"{op['minArity']}..{'∞' if op['maxArity'] is None else op['maxArity']}"
        numeric = " numericOnly" if op["numericOnly"] else ""
        print(f"probe:   {op['name']} arity {bounds}{numeric}", file=sys.stderr)

    findings = _compare(operations)
    if not findings:
        print("probe: OK — the client's arity table matches the server.", file=sys.stderr)
        return
    print(f"probe: {len(findings)} DISAGREEMENT(S) with the client's table:", file=sys.stderr)
    for finding in findings:
        print(f"probe:   {finding}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(run(probe))
