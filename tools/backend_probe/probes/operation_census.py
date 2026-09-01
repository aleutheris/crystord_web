#!/usr/bin/env python3
"""Probe: which operations are actually in use, at which argument counts, and does any atom
exceed what the client's arity table allows?

EPIC-260083 turns on a question no amount of code reading can answer: the builder silently
truncates a `MINUS` with more than two arguments on mount, but is any such atom real? A
latent bug and an active one warrant very different priorities, and the epic explicitly
says to check before scoring.

This walks every atom the caller owns, parses each `operation` payload the way
`parseOperation` (`src/api-contract/operation-payload.ts`) does, and reports the census.
Anything flagged EXCEEDS is an atom the formula builder would damage if opened and saved.

The client's caps are restated here by hand rather than imported — see `collect_queries.py`
for why a probe must never share the belief it is testing. Measured against 9.3.0 on
2026-09-01: MINUS is unbounded (8 args evaluate, left-fold), SUM and PRODUCT are unbounded,
DIVIDE is exactly two (3 args → `OP-SIG-ARITY-MISMATCH`), COLLECT is exactly one.

Read-only: it writes nothing.

Run:
  python3 tools/backend_probe/probes/operation_census.py
  python3 tools/backend_probe/probes/operation_census.py --profile nucubuntunl
"""

from __future__ import annotations

import json
import sys
from collections import Counter

from _bootstrap import Session, run, show

RETRIEVE_QUERY = """
query Retrieve {
  retrieve {
    evaluationStatus
    errorCode
    properties {
      shellies { uuid }
      nuclearies { title operation }
    }
  }
}
""".strip()

# src/features/workspace-compute/operation-metadata.ts BUILTIN_OPERATIONS, restated by hand.
# None = the client imposes no maximum (variadic).
CLIENT_MAX = {"SUM": None, "MINUS": 2, "PRODUCT": 2, "DIVIDE": 2, "COLLECT": 1}


def probe(session: Session) -> None:
    result = session.post(RETRIEVE_QUERY)
    atoms = (result.get("data") or {}).get("retrieve")
    if atoms is None:
        show(result)
        return

    census: Counter = Counter()
    exceeds = []
    unparseable = []

    for atom in atoms:
        nuclearies = (atom.get("properties") or {}).get("nuclearies") or {}
        raw = nuclearies.get("operation")
        if not raw:
            continue
        try:
            payload = json.loads(raw)
            name = payload["name"]
            args = payload.get("args") or []
        except (json.JSONDecodeError, KeyError, TypeError):
            unparseable.append((nuclearies.get("title"), raw))
            continue

        census[(name, len(args))] += 1
        cap = CLIENT_MAX.get(name, "unlisted")
        if isinstance(cap, int) and len(args) > cap:
            exceeds.append({
                "uuid": ((atom.get("properties") or {}).get("shellies") or {}).get("uuid"),
                "title": nuclearies.get("title"),
                "operation": name,
                "args": len(args),
                "clientMax": cap,
            })

    print(f"probe: {len(atoms)} atom(s) owned; {sum(census.values())} carry an operation.", file=sys.stderr)
    for (name, arity), count in sorted(census.items()):
        cap = CLIENT_MAX.get(name, "unlisted")
        note = "" if not isinstance(cap, int) or arity <= cap else f"  <-- EXCEEDS client max {cap}"
        print(f"probe:   {name}/{arity}arg x{count}{note}", file=sys.stderr)

    for title, raw in unparseable:
        print(f"probe:   UNPARSEABLE operation on {title!r}: {raw!r}", file=sys.stderr)

    show({"census": [{"operation": n, "args": a, "count": c} for (n, a), c in sorted(census.items())],
          "exceedsClientMax": exceeds})

    if exceeds:
        print(
            f"probe: *** {len(exceeds)} atom(s) would be TRUNCATED by the formula builder on open+save. "
            "EPIC-260083 is an ACTIVE bug, not a latent one. ***",
            file=sys.stderr,
        )
    else:
        print(
            "probe: no atom exceeds the client's caps — EPIC-260083 is LATENT here. Note this is "
            "one account on one server: it bounds the blast radius observed, not the blast radius.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    raise SystemExit(run(probe))
