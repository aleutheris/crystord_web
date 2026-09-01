#!/usr/bin/env python3
"""Probe: what does the server say the COLLECT registry is, and does the client's copy match?

EPIC-260082 exposes the two category COLLECT queries in the formula builder. It reads
their names and required constants from `COLLECT_QUERY_SPECS` in
`src/features/workspace-compute/operation-metadata.ts` — a table typed by hand from
`docs/user-guide.md:1317-1318`, because the epic deliberately deferred consuming the
live `collectQueries` registry (that widens the frontend's used surface inside the
pinned schema, which reopens an ICR question).

So the app ships a hand-copied constants contract that nothing verifies. If the server's
`key` strings are not exactly `dimension_key` / `value_key`, or a registered query needs
a third constant, every one of the 2028 unit tests still passes and the feature is broken
against the real backend. This probe is the only thing that closes that gap.

EXPECTED is written out here as a literal rather than imported from `src/`. That is the
point: a probe that shared the app's table could only confirm the app's own belief. What
is compared is the app's belief against the server, and the belief has to be restated
independently for the comparison to mean anything.

Run:
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/collect_queries.py
"""

from __future__ import annotations

import sys

from _bootstrap import Session, run, show

COLLECT_QUERIES_QUERY = """
query CollectQueries {
  collectQueries {
    name
    description
    constants { key type minItems }
  }
}
""".strip()

# What src/features/workspace-compute/operation-metadata.ts believes, restated by hand.
# Keys only — `type`/`minItems` are reported for inspection, since the client reads neither.
EXPECTED = {
    "atoms_with_labels": ["labels"],
    "atoms_in_category_value": ["dimension_key", "value_key"],
    "atoms_in_category_subtree": ["dimension_key", "value_key"],
}


def _compare(registry: list) -> list:
    """Every way the server's registry and the client's table disagree."""
    findings = []
    served = {q["name"]: q for q in registry}

    for name, expected_keys in EXPECTED.items():
        query = served.get(name)
        if query is None:
            findings.append(f"{name}: client offers it in the picker, server does not register it")
            continue
        actual_keys = sorted(c["key"] for c in query["constants"])
        if actual_keys != sorted(expected_keys):
            findings.append(
                f"{name}: client sends {sorted(expected_keys)}, server requires {actual_keys}"
            )

    for name in served:
        if name not in EXPECTED:
            findings.append(
                f"{name}: registered on the server but absent from the client picker "
                "(reachable only via the free-text 'other…' box)"
            )
    return findings


def probe(session: Session) -> None:
    result = session.post(COLLECT_QUERIES_QUERY)
    show(result)

    registry = (result.get("data") or {}).get("collectQueries")
    if registry is None:
        return

    print(f"probe: server registers {len(registry)} collect query/queries.", file=sys.stderr)
    for query in registry:
        specs = ", ".join(
            f"{c['key']}:{c['type']}" + (f"(minItems={c['minItems']})" if c["minItems"] is not None else "")
            for c in query["constants"]
        )
        print(f"probe:   {query['name']} requires [{specs}]", file=sys.stderr)

    findings = _compare(registry)
    if not findings:
        print("probe: OK — the client's hand-copied table matches the server registry.", file=sys.stderr)
        return
    print(f"probe: {len(findings)} DISAGREEMENT(S) with the client's table:", file=sys.stderr)
    for finding in findings:
        print(f"probe:   {finding}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(run(probe))
