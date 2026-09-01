#!/usr/bin/env python3
"""Import surface for probes.

A probe is run directly (`python3 tools/backend_probe/probes/whoami.py`), so Python
puts *this* directory on the import path — not the tool root one level up, where
client.py lives. This module bridges that gap once and re-exports the client API, so
a probe needs a single import line and never has to think about paths:

    from _bootstrap import Session, run, show

Without it every probe would carry its own copy of the sys.path dance below, which is
three lines of noise per file and one more thing to get subtly wrong.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from client import (  # noqa: E402 — must follow the sys.path insert above
    ProbeError,
    Session,
    connect,
    profile_setting,
    run,
    show,
)

__all__ = ["ProbeError", "Session", "connect", "profile_setting", "run", "show"]
