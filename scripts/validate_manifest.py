"""Validate build manifest requirements for Agent Zero dev builds.

Usage:
    python scripts/validate_manifest.py [--repo-root PATH] [--manifest PATH]

Checks performed:
    * Manifest is valid JSON and contains required top-level fields.
    * Current git commit matches manifest commit (unless skipped).
    * Required file paths exist.
    * Each marker string is present within its target file.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List


class ValidationError(Exception):
    """Raised when manifest validation fails."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate build manifest state")
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Path to the repository root (defaults to project root)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Path to manifest file (defaults to config/build_manifest.json)",
    )
    parser.add_argument(
        "--skip-commit-check",
        action="store_true",
        help="Skip verifying manifest commit against current HEAD",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print additional details about validation",
    )
    return parser.parse_args()


def debug(message: str, verbose: bool) -> None:
    if verbose:
        print(message)


def load_manifest(manifest_path: Path) -> Dict[str, Any]:
    if not manifest_path.exists():
        raise ValidationError(f"Manifest not found: {manifest_path}")
    try:
        with manifest_path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Manifest JSON invalid: {exc}") from exc


def get_current_commit(repo_root: Path) -> str:
    try:
        output = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root),
            stderr=subprocess.STDOUT,
        )
        return output.decode("utf-8").strip()
    except subprocess.CalledProcessError as exc:
        raise ValidationError(f"Unable to resolve git commit: {exc.output.decode('utf-8', 'ignore')}")


def ensure_paths_exist(repo_root: Path, feature: Dict[str, Any]) -> None:
    missing: List[str] = []
    for rel_path in feature.get("required_paths", []):
        resolved = repo_root / rel_path
        if not resolved.exists():
            missing.append(rel_path)
    if missing:
        raise ValidationError(
            f"Feature '{feature.get('name')}' is missing required files: {', '.join(missing)}"
        )


def ensure_markers_present(repo_root: Path, feature: Dict[str, Any]) -> None:
    markers: List[Dict[str, Any]] = feature.get("markers", [])
    for marker in markers:
        path = repo_root / marker.get("path", "")
        if not path.exists():
            raise ValidationError(
                f"Marker path missing for feature '{feature.get('name')}': {marker.get('path')}"
            )
        content = path.read_text(encoding="utf-8", errors="ignore")
        missing_snippets = [snippet for snippet in marker.get("must_include", []) if snippet not in content]
        if missing_snippets:
            raise ValidationError(
                "Feature '{feature}' missing required snippets in {path}: {snippets}".format(
                    feature=feature.get("name"),
                    path=marker.get("path"),
                    snippets=missing_snippets,
                )
            )


def validate_manifest(data: Dict[str, Any], repo_root: Path, skip_commit: bool, verbose: bool) -> None:
    required_keys = {"version_id", "features"}
    missing_keys = required_keys - data.keys()
    if missing_keys:
        raise ValidationError(f"Manifest missing fields: {', '.join(sorted(missing_keys))}")

    if not skip_commit:
        manifest_commit = data.get("commit_sha")
        if not manifest_commit:
            raise ValidationError("Manifest commit_sha missing. Populate before tagging.")
        current_commit = get_current_commit(repo_root)
        if current_commit != manifest_commit:
            raise ValidationError(
                "Manifest commit ({manifest}) does not match HEAD ({head}).".format(
                    manifest=manifest_commit,
                    head=current_commit,
                )
            )
        debug(f"Commit OK: {current_commit}", verbose)

    features = data.get("features", [])
    if not isinstance(features, list) or not features:
        raise ValidationError("Manifest features must be a non-empty list")

    for feature in features:
        name = feature.get("name", "<unnamed>")
        debug(f"Validating feature '{name}'", verbose)
        ensure_paths_exist(repo_root, feature)
        ensure_markers_present(repo_root, feature)


def main() -> int:
    args = parse_args()
    repo_root: Path = args.repo_root.resolve()
    manifest_path: Path = (
        args.manifest.resolve()
        if args.manifest is not None
        else repo_root / "config" / "build_manifest.json"
    )

    try:
        manifest = load_manifest(manifest_path)
        validate_manifest(manifest, repo_root, args.skip_commit_check, args.verbose)
    except ValidationError as exc:
        print(f"Manifest validation failed: {exc}")
        return 1
    except FileNotFoundError as exc:
        print(f"File not found: {exc}")
        return 1

    print("Manifest validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())



