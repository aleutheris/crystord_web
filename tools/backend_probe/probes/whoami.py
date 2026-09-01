#!/usr/bin/env python3
"""Probe: who does the backend think I am?

The smallest authenticated round-trip there is, so it doubles as the check that
your credentials work against a given profile before a longer probe wastes time
failing halfway through.

The user comes from probe_config.json's `activeUser`; only the password is ever
read from the environment.

Run:
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/whoami.py
  CRYSTORD_PASSWORD_DEMO=... python3 tools/backend_probe/probes/whoami.py --user demo
"""

from __future__ import annotations

from _bootstrap import Session, run, show

ME_QUERY = """
query Me {
  me {
    username
    email
    emailVerified
    authMethods
  }
}
""".strip()


def probe(session: Session) -> None:
    show(session.post(ME_QUERY))


if __name__ == "__main__":
    raise SystemExit(run(probe))
