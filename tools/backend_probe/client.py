#!/usr/bin/env python3
"""Minimal GraphQL client for backend probes.

Stdlib only, and deliberately independent of src/. A probe that reused the app's
Apollo client and query documents could only ever confirm the app's own beliefs
about the backend; probes send raw GraphQL strings so they can witness what the
server actually does, including where the app is wrong.

Targeting and credentials live in config.py — see its docstring for which file
owns what.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional

from config import (
    ProbeError,
    credentials,
    profile_endpoint,
    profile_setting,
    resolve_profile,
    resolve_user,
)
from config import flag as read_flag

# Re-exported so a probe has a single import surface: `from client import ...`.
__all__ = ["ProbeError", "Session", "connect", "profile_setting", "run", "show"]

REQUEST_TIMEOUT_SECONDS = 30

SIGN_IN_QUERY = """
query SignIn($email: String!, $password: String!) {
  signin(email: $email, password: $password)
}
""".strip()


def _errors_body(text: str) -> Optional[Dict[str, Any]]:
    """The parsed body if it is a GraphQL response carrying `errors`, else None.

    Distinguishes a GraphQL-level rejection (worth reading) from an infrastructure
    failure such as a proxy's HTML 502 page (worth raising).
    """
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) and parsed.get("errors") else None


def _post_graphql(
    endpoint: str,
    query: str,
    variables: Dict[str, Any],
    token: Optional[str],
) -> Dict[str, Any]:
    """POST a GraphQL document and return the parsed body.

    GraphQL `errors` are returned rather than raised: for a probe an error response
    is usually the thing under investigation (which code, which message shape). Only
    transport and parse failures raise.

    That holds across status codes: a validation error arrives as HTTP 400 with an
    ordinary GraphQL errors body. So an errors body is handed back whatever the
    status, and the status is announced on stderr — the app's Apollo link branches on
    it (resolveLinkErrorReauth in src/api-contract/apollo-client.ts).
    """
    body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            text = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        errors_body = _errors_body(detail)
        if errors_body is not None:
            print(f"probe: HTTP {exc.code} carrying a GraphQL errors body.", file=sys.stderr)
            return errors_body
        raise ProbeError(f"HTTP {exc.code} from {endpoint}: {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise ProbeError(f"Cannot reach {endpoint}: {exc.reason}") from exc

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProbeError(f"Non-JSON response from {endpoint}: {text[:500]}") from exc


def _sign_in(endpoint: str, user: str) -> str:
    email, password = credentials(user)
    response = _post_graphql(endpoint, SIGN_IN_QUERY, {"email": email, "password": password}, None)
    if response.get("errors"):
        raise ProbeError("Sign-in rejected: " + json.dumps(response["errors"], indent=2))

    token = str((response.get("data") or {}).get("signin") or "").strip()
    if not token:
        raise ProbeError("Sign-in returned no token.")
    print(f"probe: signed in as {email}", file=sys.stderr)
    return token


class Session:
    """One probe run against one endpoint. Signs in lazily, so an anonymous probe
    (schemaInfo, signin) never needs credentials in the environment."""

    def __init__(
        self,
        profile: str,
        endpoint: str,
        user: str = "",
        args: Optional[List[str]] = None,
    ) -> None:
        self.profile = profile
        self.endpoint = endpoint
        self.user = user
        self.args = list(args or [])
        self._token: Optional[str] = None

    def flag(self, name: str, default: str = "") -> str:
        """Value of a probe's own `--name VALUE` argument, so a probe can be
        parameterised from the command line instead of by editing the file."""
        return read_flag(self.args, name) or default

    def post(
        self,
        query: str,
        variables: Optional[Dict[str, Any]] = None,
        *,
        auth: bool = True,
    ) -> Dict[str, Any]:
        """Send a raw GraphQL document and return the parsed response body."""
        token = self._auth_token() if auth else None
        return _post_graphql(self.endpoint, query, variables or {}, token)

    def _auth_token(self) -> str:
        if self._token is None:
            self._token = _sign_in(self.endpoint, self.user)
        return self._token


def connect(argv: Optional[List[str]] = None) -> Session:
    """Resolve the target and announce it on stderr.

    The banner is not decoration: probes mutate real data on whichever server the
    resolved profile happens to name, and that selection comes from files a probe
    did not write. Every run states what it is about to hit, and as whom.
    """
    args = list(sys.argv[1:] if argv is None else argv)
    profile = resolve_profile(args)
    endpoint = read_flag(args, "--endpoint") or profile_endpoint(profile)
    user = resolve_user(args)
    print(
        f"probe: profile={profile} endpoint={endpoint} user={user or '(environment)'}",
        file=sys.stderr,
    )
    return Session(profile=profile, endpoint=endpoint, user=user, args=args)


def show(result: Dict[str, Any]) -> None:
    """Print a response: JSON on stdout (pipe it to jq), any error count on stderr."""
    print(json.dumps(result, indent=2))
    errors = result.get("errors") or []
    if errors:
        print(f"probe: {len(errors)} GraphQL error(s) in the response above.", file=sys.stderr)


def run(probe: Callable[[Session], None], argv: Optional[List[str]] = None) -> int:
    """Entry point for a probe script: help, connect, run, report failures uniformly.

    The exit code reflects whether the round-trip happened, not whether the server
    liked the request — a GraphQL error is a finding, not a tool failure.
    """
    args = list(sys.argv[1:] if argv is None else argv)
    if "--help" in args or "-h" in args:
        print((getattr(sys.modules["__main__"], "__doc__", "") or "").strip())
        return 0
    try:
        probe(connect(args))
        return 0
    except ProbeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
