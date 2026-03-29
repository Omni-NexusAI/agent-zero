"""Promote the current development state into a validated dev build.

This script orchestrates the standard workflow:
    * Update manifest metadata (commit SHA, timestamp, display banner)
    * Run manifest validator to ensure required features are present
    * Optionally update `.env` with the friendly build display string

Usage:
    python scripts/promote_dev_build.py [--version-id VERSION]
                                       [--manifest PATH]
                                       [--update-env]
"""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from python.helpers import build_info, dotenv


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote current dev state to manifest build")
    parser.add_argument(
        "--version-id",
        type=str,
        help="Optional version identifier (defaults to manifest value)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Path to manifest file (defaults to config/build_manifest.json)",
    )
    parser.add_argument(
        "--update-env",
        action="store_true",
        help="Persist the computed display version into .env (A0_BUILD_VERSION)",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip manifest validation (not recommended)",
    )
    return parser.parse_args()


def run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def ensure_manifest_metadata(args: argparse.Namespace) -> None:
    cmd = ["python", "scripts/update_manifest_version.py"]
    if args.version_id:
        cmd.extend(["--version-id", args.version_id])
    if args.manifest:
        cmd.extend(["--manifest", str(args.manifest)])
    run(cmd)
    build_info.refresh_cache()


def validate_manifest(args: argparse.Namespace) -> None:
    if args.skip_validation:
        print("[promote] Skipping manifest validation per flag")
        return

    cmd = ["python", "scripts/validate_manifest.py", "--verbose"]
    if args.manifest:
        cmd.extend(["--manifest", str(args.manifest)])
    run(cmd)


def update_env_banner() -> None:
    banner = build_info.get_display_version()
    dotenv.save_dotenv_value("A0_BUILD_VERSION", banner)
    print(f"[promote] Updated .env with A0_BUILD_VERSION={banner}")


def main() -> int:
    args = parse_args()

    ensure_manifest_metadata(args)
    validate_manifest(args)

    if args.update_env:
        update_env_banner()

    banner = build_info.get_display_version()
    print("[promote] Promotion complete")
    print(f"  Display version: {banner}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

