#!/usr/bin/env python3
"""Probe: what do the taxonomy reads actually return — access levels, and the page ceiling?

Two EPIC-260082 decisions rest entirely on documentation, and this probe measures both.

**Access levels (the ownership gate, finding 7).** `retrieveCategoryValues` is
access-scoped to taxonomy the caller owns *or has been granted* (`user-guide.md:270-272`),
while the category COLLECT queries "only resolve values you own" (`user-guide.md:1320`).
The builder bridges that gap by marking any value whose `accessLevel != 'OWNER'` as
unusable and blocking the save. If the server never returns a non-OWNER value here, that
gate is untested in the field; if it returns levels the client does not expect, the gate
mis-fires. Either way the app has been asserting a value it never read back.

**The page ceiling (findings 11, 14, 16).** "Pagination defaults to `limit=25`,
`max limit=100`; over-limit → `OR-QUERY-LIMIT-EXCEEDED`" (`user-guide.md:1096`). The hook
requests exactly 100 and treats a full page as possibly-truncated. `--limit 101` asks the
server to confirm the ceiling really is enforced, rather than silently clamped — the app
would behave differently if over-limit were clamped instead of rejected.

Run:
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/category_taxonomy.py
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/category_taxonomy.py --dimension region
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/category_taxonomy.py --dimension region --limit 101
"""

from __future__ import annotations

import sys
from collections import Counter

from _bootstrap import Session, run, show

DIMENSIONS_QUERY = """
query RetrieveCategoryDimensions($selector: CategoryDimensionSelector) {
  retrieveCategoryDimensions(selector: $selector) {
    key
    displayName
    parentDimensionKeys
    accessLevel
    ownerUsername
  }
}
""".strip()

VALUES_QUERY = """
query RetrieveCategoryValues($selector: CategoryValueSelector) {
  retrieveCategoryValues(selector: $selector) {
    key
    displayName
    dimensionKey
    parentValueKeys
    accessLevel
    ownerUsername
  }
}
""".strip()

# What use-category-options.ts requests: the documented maximum, never the default 25.
PAGE_LIMIT = 100


def _report_access(kind: str, rows: list) -> None:
    levels = Counter(row["accessLevel"] for row in rows)
    print(f"probe: {len(rows)} {kind}; accessLevel {dict(levels)}", file=sys.stderr)
    unowned = [r for r in rows if r["accessLevel"] != "OWNER"]
    if kind == "value(s)" and unowned:
        print(
            f"probe:   {len(unowned)} NOT owned — these are exactly what the builder must mark "
            "unusable, since the COLLECT queries cannot resolve them:",
            file=sys.stderr,
        )
        for row in unowned:
            print(
                f"probe:     {row['key']} ({row['accessLevel']}, owner={row['ownerUsername']})",
                file=sys.stderr,
            )
    elif kind == "value(s)":
        print(
            "probe:   all owned — the ownership gate is correct but unexercised here. "
            "Share a value from another account to test it for real.",
            file=sys.stderr,
        )


def probe(session: Session) -> None:
    limit = int(session.flag("--limit", str(PAGE_LIMIT)))
    dimension = session.flag("--dimension")

    if not dimension:
        result = session.post(DIMENSIONS_QUERY, {"selector": {"limit": limit}})
        show(result)
        rows = (result.get("data") or {}).get("retrieveCategoryDimensions")
        if rows is None:
            print(f"probe: limit={limit} was REJECTED (see errors above).", file=sys.stderr)
            return
        _report_access("dimension(s)", rows)
        if len(rows) == limit:
            print(
                f"probe:   page is FULL at {limit} — indistinguishable from 'there is more', "
                "which is why the picker forfeits authority and hedges its note.",
                file=sys.stderr,
            )
        print("probe: pass --dimension KEY to list one dimension's values.", file=sys.stderr)
        return

    result = session.post(VALUES_QUERY, {"selector": {"dimensionKey": dimension, "limit": limit}})
    show(result)
    rows = (result.get("data") or {}).get("retrieveCategoryValues")
    if rows is None:
        print(f"probe: dimensionKey={dimension} limit={limit} was REJECTED (see errors above).", file=sys.stderr)
        return
    _report_access("value(s)", rows)
    if len(rows) == limit:
        print(
            f"probe:   page is FULL at {limit} — anything beyond it is unreachable in the "
            "picker, which does not page.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    raise SystemExit(run(probe))
