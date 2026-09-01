#!/usr/bin/env python3
"""Probe: which labels exist on the backend, by prefix?

Ported from crystord_access/scripts/list_labels.py. Same operation
(`listLabels(labelsPrefix: String!)`, unchanged in schema 9.3.0), but parameterised
from the command line rather than by editing an INPUTS block, and without the
client-side display cap the original applied — truncating the printout would
misreport how many labels the server actually returned. Slice it yourself if the
list is long:

  python3 tools/backend_probe/probes/list_labels.py | jq '.data.listLabels[:20]'

Two behaviours observed against 9.3.0 (2026-09-01, both verified with this probe —
neither is stated in the schema, which only says `labelsPrefix: String!`):

  - **An empty prefix fails open**: it returns every label the caller owns, rather
    than none. That is the reading LRN-003 tells you to assume until proven
    otherwise, and here it holds. It is benign for a listing operation — unlike the
    COLLECT-constants case LRN-003 documents, which 9.3.0 now rejects outright — but
    it is a wildcard, not a no-op, so never emit it as a default from the app.
  - **Matching is case-sensitive**: prefix `C` returns `["Car"]` while `c` returns
    `[]`. Any label-search surface that lowercases user input will silently find
    nothing.

The probe reports the count on stderr so a regression in either is visible.

Run:
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/list_labels.py
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/list_labels.py --prefix m
"""

from __future__ import annotations

import sys

from _bootstrap import Session, run, show

LIST_LABELS_QUERY = """
query ListLabels($labelsPrefix: String!) {
  listLabels(labelsPrefix: $labelsPrefix)
}
""".strip()


def probe(session: Session) -> None:
    prefix = session.flag("--prefix")
    result = session.post(LIST_LABELS_QUERY, {"labelsPrefix": prefix})
    show(result)

    labels = (result.get("data") or {}).get("listLabels")
    if labels is None:
        return
    shown = prefix or "(empty)"
    print(f"probe: prefix={shown} returned {len(labels)} label(s).", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(run(probe))
