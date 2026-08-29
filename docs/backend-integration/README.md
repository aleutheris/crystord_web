# Backend Interface Bundles

This folder is the drop point for Crystord backend interface bundles and the
home of the installer that unpacks them. It follows the same handoff mechanism
used by the `crystord_access` project.

## What a bundle is

Each release is a folder `crystord-interface-vX.Y.Z/` containing:

- `crystord-interface-vX.Y.Z.tgz` — the payload
- `verify.py` — a self-contained integrity + compatibility verifier
- `README-HANDOFF.txt` — handoff notes from the backend team

The `.tgz` contains a single top-level directory with:

- `crystord_server/schema.graphql` — backend GraphQL schema snapshot
- `docs/user-guide.md`
- `docs/governance/project/evolution/contracts/schema-compatibility-contract.md`
  (bundles up to v6.0.0 shipped this under `.github/project/evolution/contracts/`)
- `manifest.json` — `schemaVersion`, `schemaHash`, `releasedAt`, and a per-file
  `sha256`/`sizeBytes` list

## Installing a bundle

1. Drop the new `crystord-interface-vX.Y.Z/` folder into this directory
   (`docs/backend-integration/`).
2. Run the installer from the project root:

   ```bash
   python3 tools/install_interface.py
   ```

The installer auto-discovers the **highest-versioned** bundle here, verifies it
with the bundle's own `verify.py` against a range derived from its major version
(`^MAJOR.0.0`), and extracts files into `docs/`:

- `crystord_server/schema.graphql` → `docs/crystord_server/schema.graphql`
- `docs/user-guide.md` → `docs/user-guide.md`
- `docs/governance/.../schema-compatibility-contract.md` → same path at the project
  root, i.e. it lands **on top of** this project's own governed contract record
  (`docs/governance/project/evolution/contracts/schema-compatibility-contract.md`,
  registered in `contract-index.md`). Bundles up to v6.0.0 used the `.github/`
  layout and were remapped to `docs/contracts/` instead — the copy still sitting
  there is a stale orphan of that older layout.

Note the `--supported-range` printed in a bundle's `README-HANDOFF.txt` is stale
boilerplate (`^3.0.0` in every bundle since v4.0.0) and will report
`Compatible: no`. The installer ignores it and derives `^MAJOR.0.0` from the
bundle itself; use the installer rather than the handoff command.

The same newest-bundle verification runs automatically as a preflight in
`tools/run_tests.py`.

## Runtime compatibility

The installed files are development-time references. The running frontend does
**not** read them. At startup the app queries `schemaInfo` and compares the
backend's `schemaVersion` against `backendSchemaRange` from the deployed
`config.json` (see `src/config.ts`, `src/bootstrap/startup-check.ts`). When a
new bundle changes the supported major version, update `backendSchemaRange` in
`public/config.json` accordingly.

```graphql
query {
  schemaInfo {
    schemaVersion
    schemaHash
    releasedAt
  }
}
```
