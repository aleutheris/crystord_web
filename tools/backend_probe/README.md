# Backend Probe

A hand-run channel for asking the **real** Crystord backend what it actually does.

Every automated check in this repo talks to a mock: Vitest mocks Apollo, Playwright
mocks every route and now fails on fallthrough (`e2e/graphql-mock.ts`). That is the
right design for tests — deterministic and offline — but it means every fixture is a
written-down *belief* about the server, and beliefs drift silently. This folder is the
other half: a way to observe the server directly, without booting the UI and clicking.

## What this is not

- **Not part of the app.** Nothing under `src/` imports it; nothing here ships.
- **Not a test suite.** It hits a live server, so it is deliberately absent from
  `tools/run_tests.py`. Findings get promoted into real tests or governance records —
  the probe itself is scaffolding.
- **Not server management.** It does not configure, deploy, or administer the backend.
  It only asks it questions.

## Configuration

Nothing to install. Stdlib Python 3 only — no venv, no npm, no dependencies.

Two files, split by who owns them:

| File | Holds | Shared with | Tracked in git |
|---|---|---|---|
| `../../deploy_config.json` | **Servers** — named profiles and their `graphqlEndpoint` | the app | yes |
| `probe_config.json` | **Selection + credentials** — profile, user, password | nothing | **no** |

`probe_config.json` *names* a deploy profile, it never redefines one, so the endpoint
has exactly one definition and the two files cannot drift.

First run, copy the tracked template and fill in a real password:

```bash
cp tools/backend_probe/probe_config.example.json tools/backend_probe/probe_config.json
```

```json
{
  "profile": "",
  "activeUser": "demo",
  "users": {
    "demo": { "email": "demo@demo.invalid", "password": "..." }
  }
}
```

`probe_config.json` is gitignored, so the real password never enters a commit or the
history — only `probe_config.example.json`, with a placeholder, is tracked. Every
run reads whatever is on your disk right then; there is no export step.

Leave `profile` empty to follow `deploy_config.json`'s own `active`. Set it to target
a different server than the app — probe the hosted backend while `npm run dev` stays
on local, without touching a shared file.

To add an account, add an entry to `users` and point `activeUser` at it. For a
password you would rather not write to disk at all — even gitignored, e.g. a
personal or production account — the environment still overrides the file:

```bash
export CRYSTORD_PASSWORD_DEMO=...   # per user — preferred
export CRYSTORD_PASSWORD=...        # fallback for any user
```

The per-user form exists so a locally-set password cannot be sent to a hosted server
by a forgotten `export`. `CRYSTORD_EMAIL` overrides the users map entirely, for a
one-off account that does not deserve a file edit.

Anonymous probes (`schemaInfo`, `signin`) need no credentials at all: sign-in is lazy,
so a probe that never makes an authenticated call never asks.

## Running

```bash
python3 tools/backend_probe/probes/schema_info.py                 # selected profile
python3 tools/backend_probe/probes/schema_info.py --profile local
python3 tools/backend_probe/probes/whoami.py --user demo
python3 tools/backend_probe/probes/whoami.py --help               # the probe's docstring
```

Resolution order, each overriding the next:

- **profile** — `--profile NAME` > `CRYSTORD_PROFILE` > `probe_config.json` > `deploy_config.json`'s `active`
- **user** — `--user NAME` > `CRYSTORD_USER` > `probe_config.json`'s `activeUser`

`--endpoint URL` bypasses profile lookup entirely for a one-off experiment.

Every run announces its target on stderr before doing anything:

```
probe: profile=nucubuntunl endpoint=http://crystord:5665/graphql user=demo
```

That banner is not decoration. A probe mutates real data on whichever server the
resolved profile names, and that selection comes from files the probe did not write.

Responses print as JSON on **stdout** and everything else on **stderr**, so `| jq`
works cleanly:

```bash
python3 tools/backend_probe/probes/schema_info.py | jq -r '.data.schemaInfo.schemaHash'
```

## Layout

```
backend_probe/
  client.py           # transport: sign-in, GraphQL POST, output
  config.py           # targeting: which server, which user
  probe_config.json   # the selection you edit
  probes/             # one file per question — the point of the tool
    _bootstrap.py     # path bridge + import surface; not a probe
    schema_info.py
    whoami.py
    list_labels.py
```

A probe takes its own arguments via `session.flag("--name")`, so it is parameterised
from the command line rather than by editing an INPUTS block in the file
(`list_labels.py --prefix m`).

`schema_info.py` and `whoami.py` are real probes, not placeholders — reachability and
credential checks you will actually run — and they double as the reference for the
anonymous and authenticated patterns. Copy either one to start a new probe.

## Writing a probe

One file per question, in `probes/`:

```python
#!/usr/bin/env python3
"""Probe: <the question this answers>."""

from _bootstrap import Session, run, show

QUERY = """
query Something { ... }
""".strip()


def probe(session: Session) -> None:
    show(session.post(QUERY, {"someVar": "value"}))   # auth=False for public ops


if __name__ == "__main__":
    raise SystemExit(run(probe))
```

`_bootstrap.py` exists only because a probe run directly puts `probes/` on the import
path rather than the tool root. It absorbs that once and re-exports the client API, so
no probe carries its own `sys.path` dance.

Queries are raw strings, taken from `docs/crystord_server/schema.graphql` (the shape
contract) and `docs/user-guide.md` (the behaviour contract).

### Why raw strings instead of reusing `src/api-contract/`

Because reuse would destroy the point. A probe built on the app's Apollo client and
query documents can only ever confirm the app's *own* beliefs — if a document in
`src/api-contract/` is wrong, a probe sharing it is wrong in exactly the same way and
reports success. Independence is what lets a probe catch the app being wrong.

The single exception is the endpoint list: `deploy_config.json` stays the one source of
truth for "where is the backend", because a second copy of that would drift, which is
the very failure mode this tool exists to catch.

## Error responses are findings, not failures

A GraphQL error is usually the thing being investigated, so `client.py` prints the
error body and still exits 0. Only configuration, credential, and transport problems
exit 1. This holds across status codes: a validation error arrives as HTTP 400 with an
ordinary GraphQL errors body, and it is rendered as a normal response with the status
noted on stderr rather than buried in an exception.
