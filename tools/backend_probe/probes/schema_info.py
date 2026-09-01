#!/usr/bin/env python3
"""Probe: what does the live backend report for schemaInfo?

Answers three things in one round-trip:
  - is the configured endpoint reachable and serving GraphQL at all,
  - which schemaVersion/schemaHash the server actually runs, and
  - how that compares to the backendSchemaRange the profile expects.

The app asks the same question at startup (src/bootstrap/startup-check.ts) but
only ever surfaces pass/fail. This prints the raw answer, which is also the value
e2e/graphql-mock.ts hardcodes in SCHEMA_INFO — so it is the cheapest way to catch
that fixture drifting away from the real server.

Anonymous: schemaInfo is a public operation, so no credentials are needed.

Run:
  python3 tools/backend_probe/probes/schema_info.py
  python3 tools/backend_probe/probes/schema_info.py --profile local
"""

from __future__ import annotations

import sys

from _bootstrap import Session, profile_setting, run, show

SCHEMA_INFO_QUERY = """
query StartupSchemaInfo {
  schemaInfo {
    schemaVersion
    schemaHash
    releasedAt
  }
}
""".strip()


def probe(session: Session) -> None:
    result = session.post(SCHEMA_INFO_QUERY, auth=False)
    show(result)

    live = ((result.get("data") or {}).get("schemaInfo") or {}).get("schemaVersion") or "(none)"
    expected = profile_setting(session.profile, "backendSchemaRange") or "(unset)"
    print(f"probe: live schemaVersion={live}, profile expects {expected}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(run(probe))
