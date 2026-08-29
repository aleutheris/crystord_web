Crystord Interface Handoff

This folder is intended to be copied as-is to a client/frontend project.

Files:
- crystord-interface-v9.3.0.tgz
- verify.py

Verify command:
python3 verify.py crystord-interface-v9.3.0.tgz --supported-range "^9.0.0"

NOTE (corrected downstream): the range shipped by the backend handoff generator
read "^3.0.0" -- stale boilerplate repeated verbatim in every bundle since v4.0.0,
and it reports "Compatible: no" for any bundle with a major other than 3. The
range must track the bundle's own major version (^MAJOR.0.0), which is what
`tools/install_interface.py` derives automatically. Prefer running the installer
from the project root over the command above:

    python3 tools/install_interface.py
