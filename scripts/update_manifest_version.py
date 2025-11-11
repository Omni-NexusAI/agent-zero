"""Update build manifest metadata (commit sha, timestamp, optional version id).

Usage:
    python scripts/update_manifest_version.py [--version-id VERSION]
                                              [--timestamp ISO8601]
                                              [--manifest PATH]

Automatically fills `commit_sha` with the current HEAD of the repository and
`timestamp` with the current UTC time (unless overridden). Intended to be run
right before manifest validation + tagging so other agents do not need to edit
JSON manually.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Populate build manifest metadata")
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Path to manifest file (defaults to config/build_manifest.json)",
    )
    parser.add_argument(
        "--version-id",
        type=str,
        help="Optional version_id override (defaults to existing value)",
    )
    parser.add_argument(
        "--timestamp",
        type=str,
        help="ISO8601 timestamp to store (defaults to current UTC)",
    )
    return parser.parse_args()


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def get_current_commit(repo_root: Path) -> str:
    output = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=str(repo_root))
    return output.decode("utf-8").strip()


def resolve_manifest_path(args_manifest: Path | None, repo_root: Path) -> Path:
    if args_manifest is not None:
        return args_manifest.resolve()
    return repo_root / "config" / "build_manifest.json"


def load_manifest(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_manifest(path: Path, data: dict) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=4)
        fh.write("\n")


def main() -> int:
    args = parse_args()
    repo_root = get_repo_root()
    manifest_path = resolve_manifest_path(args.manifest, repo_root)

    data = load_manifest(manifest_path)

    commit = get_current_commit(repo_root)
    timestamp = args.timestamp or datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    data["commit_sha"] = commit
    data["timestamp"] = timestamp
    if args.version_id:
        data["version_id"] = args.version_id

    write_manifest(manifest_path, data)

    print(f"Updated manifest at {manifest_path}")
    print(f"  commit_sha = {commit}")
    print(f"  timestamp  = {timestamp}")
    if args.version_id:
        print(f"  version_id = {args.version_id}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())


