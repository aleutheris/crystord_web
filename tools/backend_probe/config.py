#!/usr/bin/env python3
"""Where a probe points, and who it signs in as.

Two files, split by who owns them:

  ../../deploy_config.json  — servers. Shared with the app and the single source
                              of truth for endpoints. Probes only ever read it.
  ./probe_config.json       — probe-local selection AND credentials: which of those
                              profiles to target, which user to be, and that user's
                              password. Names a profile, never redefines one, so the
                              two cannot drift apart.

probe_config.json is gitignored — it is where real passwords live, on disk only,
never in git history. ./probe_config.example.json is the tracked template: same
shape, placeholder password, copy it to probe_config.json and fill in the real
value. CRYSTORD_PASSWORD[_<USER>] still overrides the file, for a password you
deliberately do not want to write down even locally (a personal or production
account, say).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEPLOY_CONFIG = PROJECT_ROOT / "deploy_config.json"
PROBE_CONFIG = Path(__file__).resolve().parent / "probe_config.json"

PROFILE_ENV = "CRYSTORD_PROFILE"
USER_ENV = "CRYSTORD_USER"
EMAIL_ENV = "CRYSTORD_EMAIL"
PASSWORD_ENV = "CRYSTORD_PASSWORD"


class ProbeError(RuntimeError):
    """Raised for configuration, credential, or transport problems."""


def _load(path: Path, *, required: bool) -> Dict[str, Any]:
    if not path.exists():
        if required:
            raise ProbeError(f"{path.name} not found at {path}.")
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProbeError(f"Invalid JSON in {path.name}: {exc}") from exc


def _deploy() -> Dict[str, Any]:
    return _load(DEPLOY_CONFIG, required=True)


def _probe() -> Dict[str, Any]:
    """probe_config.json is optional; every default still works without it."""
    return _load(PROBE_CONFIG, required=False)


def flag(argv: List[str], name: str) -> str:
    """Value of `--name VALUE`, or "" when the flag is absent."""
    if name not in argv:
        return ""
    index = argv.index(name)
    if index + 1 >= len(argv):
        raise ProbeError(f"{name} requires a value.")
    return argv[index + 1].strip()


def _first(*candidates: str) -> str:
    for candidate in candidates:
        if candidate:
            return candidate
    return ""


def resolve_profile(argv: List[str]) -> str:
    """`--profile` > CRYSTORD_PROFILE > probe_config `profile` > deploy_config `active`.

    probe_config sits above deploy_config's `active` so a probe can target one server
    while `npm run dev` stays pointed at another.

    scripts/config.mjs additionally prefers `deployProfile` under CI, so a build can
    never ship a developer's local endpoint. That guard is irrelevant here: a probe is
    a hand-run development tool and never executes in CI.
    """
    resolved = _first(
        flag(argv, "--profile"),
        os.environ.get(PROFILE_ENV, "").strip(),
        str(_probe().get("profile", "")).strip(),
        str(_deploy().get("active", "")).strip(),
    )
    if not resolved:
        raise ProbeError(
            'No profile: --profile was not given, and neither probe_config.json '
            '"profile" nor deploy_config.json "active" is set.'
        )
    return resolved


def profile_endpoint(profile: str) -> str:
    profiles = _deploy().get("profiles") or {}
    entry = profiles.get(profile)
    if not isinstance(entry, dict):
        available = ", ".join(sorted(profiles)) or "(none)"
        raise ProbeError(f'Unknown profile "{profile}". Available: {available}')
    endpoint = str(entry.get("graphqlEndpoint", "")).strip()
    if not endpoint:
        raise ProbeError(f'Profile "{profile}" has no graphqlEndpoint.')
    return endpoint


def profile_setting(profile: str, key: str, default: str = "") -> str:
    """Read any other field of a deploy profile — `backendSchemaRange`, for example."""
    entry = (_deploy().get("profiles") or {}).get(profile)
    if not isinstance(entry, dict):
        return default
    return str(entry.get(key, default))


def resolve_user(argv: List[str]) -> str:
    """`--user` > CRYSTORD_USER > probe_config `activeUser`. May be "" (env-only)."""
    return _first(
        flag(argv, "--user"),
        os.environ.get(USER_ENV, "").strip(),
        str(_probe().get("activeUser", "")).strip(),
    )


def password_env(user: str) -> str:
    """Per-user password variable, so a local password cannot reach a hosted server."""
    safe = "".join(ch if ch.isalnum() else "_" for ch in user).upper()
    return f"{PASSWORD_ENV}_{safe}" if safe else PASSWORD_ENV


def credentials(user: str) -> Tuple[str, str]:
    """Email and password for `user`.

    Both come from probe_config.json's users map by default. CRYSTORD_EMAIL and
    CRYSTORD_PASSWORD[_<USER>] override the file field-by-field, for a one-off
    account or a password you would rather not write to disk even in a gitignored
    file.
    """
    entry = _user_entry(user)
    email = os.environ.get(EMAIL_ENV, "").strip() or str(entry.get("email", "")).strip()
    password = _first(
        os.environ.get(password_env(user), ""),
        os.environ.get(PASSWORD_ENV, ""),
        str(entry.get("password", "")).strip(),
    )

    if not email:
        raise ProbeError(
            f"No email for an authenticated probe. Set {EMAIL_ENV}, or add a user to "
            f"{PROBE_CONFIG.name} and select it with --user."
        )
    if not password:
        wanted = password_env(user)
        alternative = f" (or {PASSWORD_ENV})" if wanted != PASSWORD_ENV else ""
        raise ProbeError(
            f'No password for {email}. Add "password" for this user in {PROBE_CONFIG.name}, '
            f"or set {wanted}{alternative} in the environment."
        )
    return email, password


def _user_entry(user: str) -> Dict[str, Any]:
    if not user:
        return {}
    users = _probe().get("users") or {}
    entry = users.get(user)
    if not isinstance(entry, dict):
        known = ", ".join(sorted(users)) or "(none)"
        raise ProbeError(f'Unknown user "{user}" in {PROBE_CONFIG.name}. Known: {known}')
    return entry
