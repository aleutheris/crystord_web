#!/usr/bin/env python3
"""Verify a published Crystord public-interface bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import tarfile
import tempfile
import zipfile
from pathlib import Path


class VerificationError(Exception):
    """Raised when an interface bundle fails verification."""


_SEMVER_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")


def parse_semver(version: str) -> tuple[int, int, int]:
    match = _SEMVER_RE.fullmatch(version or "")
    if not match:
        raise ValueError(f"Invalid semantic version: {version!r}")
    return int(match.group(1)), int(match.group(2)), int(match.group(3))


def is_schema_version_supported(schema_version: str, supported_range: str) -> bool:
    current = parse_semver(schema_version)
    for constraint in _split_constraints(supported_range):
        if not _satisfies(current, constraint):
            return False
    return True


def _split_constraints(supported_range: str) -> list[str]:
    if not supported_range or not supported_range.strip():
        raise ValueError("supported_range must be non-empty")

    supported_range = supported_range.strip()
    if supported_range.startswith("^"):
        base = parse_semver(supported_range[1:])
        upper = (base[0] + 1, 0, 0)
        return [f">={_to_semver(base)}", f"<{_to_semver(upper)}"]

    return [part.strip() for part in supported_range.split(",") if part.strip()]


def _satisfies(current: tuple[int, int, int], constraint: str) -> bool:
    operator = None
    target_text = constraint
    for candidate in (">=", "<=", ">", "<", "="):
        if constraint.startswith(candidate):
            operator = candidate
            target_text = constraint[len(candidate):].strip()
            break

    target = parse_semver(target_text)

    if operator is None or operator == "=":
        return current == target
    if operator == ">=":
        return current >= target
    if operator == "<=":
        return current <= target
    if operator == ">":
        return current > target
    return current < target


def _to_semver(version_tuple: tuple[int, int, int]) -> str:
    return f"{version_tuple[0]}.{version_tuple[1]}.{version_tuple[2]}"


def _sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(8192)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def _extract_bundle(archive_path: Path, destination: Path) -> Path:
    if archive_path.suffix == ".zip":
        with zipfile.ZipFile(archive_path, "r") as archive:
            archive.extractall(destination)
    elif archive_path.name.endswith(".tgz") or archive_path.suffixes[-2:] == [".tar", ".gz"]:
        with tarfile.open(archive_path, "r:gz") as archive:
            archive.extractall(destination, filter="fully_trusted")
    else:
        raise VerificationError(
            f"Unsupported archive format for {archive_path.name}. Use .tgz, .tar.gz, or .zip."
        )

    roots = [p for p in destination.iterdir() if p.is_dir()]
    if len(roots) != 1:
        raise VerificationError(
            "Bundle must contain exactly one top-level directory."
        )
    return roots[0]


def _load_manifest(bundle_root: Path) -> dict:
    manifest_path = bundle_root / "manifest.json"
    if not manifest_path.exists():
        raise VerificationError("manifest.json is missing from bundle root.")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise VerificationError(f"manifest.json is invalid JSON: {exc}") from exc

    required_fields = [
        "schemaVersion",
        "schemaHash",
        "releasedAt",
        "archiveFormat",
        "files",
    ]
    for field in required_fields:
        if field not in manifest:
            raise VerificationError(f"manifest.json missing required field: {field}")

    if not isinstance(manifest["files"], list) or not manifest["files"]:
        raise VerificationError("manifest.json field 'files' must be a non-empty list.")

    return manifest


def _verify_required_public_files(bundle_root: Path) -> None:
    required = [
        Path("crystord_server/schema.graphql"),
        Path("docs/user-guide.md"),
        Path("docs/governance/project/evolution/contracts/schema-compatibility-contract.md"),
    ]
    missing = [path for path in required if not (bundle_root / path).exists()]
    if missing:
        raise VerificationError(
            "Bundle is missing required public interface file(s): "
            + ", ".join(path.as_posix() for path in missing)
        )


def _verify_manifest_files(bundle_root: Path, manifest: dict) -> None:
    for entry in manifest["files"]:
        if not isinstance(entry, dict):
            raise VerificationError("manifest.files entries must be objects.")

        for key in ("path", "sha256", "sizeBytes"):
            if key not in entry:
                raise VerificationError(f"manifest file entry missing field: {key}")

        rel = Path(str(entry["path"]))
        file_path = bundle_root / rel
        if not file_path.exists() or not file_path.is_file():
            raise VerificationError(f"File listed in manifest not found: {rel.as_posix()}")

        actual_hash = _sha256_of_file(file_path)
        if actual_hash != entry["sha256"]:
            raise VerificationError(
                f"Checksum mismatch for {rel.as_posix()}: expected {entry['sha256']}, got {actual_hash}"
            )

        actual_size = file_path.stat().st_size
        if actual_size != entry["sizeBytes"]:
            raise VerificationError(
                f"Size mismatch for {rel.as_posix()}: expected {entry['sizeBytes']}, got {actual_size}"
            )


def _verify_schema_hash(bundle_root: Path, manifest: dict) -> None:
    schema_path = bundle_root / "crystord_server/schema.graphql"
    schema_hash = _sha256_of_file(schema_path)
    if schema_hash != manifest["schemaHash"]:
        raise VerificationError(
            f"Schema hash mismatch: expected {manifest['schemaHash']}, got {schema_hash}"
        )


def verify_bundle(archive_path: Path, supported_range: str) -> dict:
    if not archive_path.exists() or not archive_path.is_file():
        raise VerificationError(f"Bundle not found: {archive_path}")

    with tempfile.TemporaryDirectory(prefix="crystord-interface-verify-") as temp_dir:
        temp_root = Path(temp_dir)
        bundle_root = _extract_bundle(archive_path, temp_root)
        manifest = _load_manifest(bundle_root)

        _verify_required_public_files(bundle_root)
        _verify_manifest_files(bundle_root, manifest)
        _verify_schema_hash(bundle_root, manifest)

        try:
            parse_semver(manifest["schemaVersion"])
        except ValueError as exc:
            raise VerificationError(
                f"Invalid semantic version in manifest schemaVersion: {manifest['schemaVersion']}"
            ) from exc

        compatible = is_schema_version_supported(manifest["schemaVersion"], supported_range)
        return {
            "archive": str(archive_path),
            "schemaVersion": manifest["schemaVersion"],
            "schemaHash": manifest["schemaHash"],
            "releasedAt": manifest["releasedAt"],
            "supportedRange": supported_range,
            "compatible": compatible,
        }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify a Crystord interface bundle for integrity and semver compatibility.",
    )
    parser.add_argument(
        "archive",
        help="Path to interface archive (.tgz, .tar.gz, or .zip).",
    )
    parser.add_argument(
        "--supported-range",
        required=True,
        help="Semver range supported by the client, e.g. '^1.1.0' or '>=1.1.0,<2.0.0'.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print verification result as JSON.",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    archive_path = Path(args.archive).resolve()

    try:
        result = verify_bundle(archive_path, args.supported_range)
    except VerificationError as exc:
        print(f"ERROR: {exc}")
        return 2

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"Archive: {result['archive']}")
        print(f"Schema version: {result['schemaVersion']}")
        print(f"Released at: {result['releasedAt']}")
        print(f"Supported range: {result['supportedRange']}")
        print(f"Compatible: {'yes' if result['compatible'] else 'no'}")

    return 0 if result["compatible"] else 3


if __name__ == "__main__":
    raise SystemExit(main())
