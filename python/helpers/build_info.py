"""Helpers for accessing build metadata and display version strings."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from python.helpers import files, dotenv


def _manifest_path() -> Path:
    return Path(files.get_abs_path("config/build_manifest.json"))


def _load_manifest() -> Dict[str, Any]:
    path = _manifest_path()
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def get_version_metadata() -> Dict[str, Any]:
    data = _load_manifest()
    if not isinstance(data, dict):
        data = {}
    data.setdefault("version_id", "")
    data.setdefault("timestamp", "")
    data.setdefault("display_version", "")
    return data


def format_timestamp(value: str | None) -> str:
    if not value:
        return "unknown"
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def friendly_version_label(version_id: str | None) -> str:
    if not version_id:
        return "Version Unknown"

    core = version_id.strip()
    if core.lower().startswith("dev-"):
        core = core[4:]

    parts = core.split("-")
    if len(parts) >= 2:
        head = parts[0]
        rest = "-".join(parts[1:])
        core = f"{head} {rest}"

    return f"Version {core}" if not core.lower().startswith("version ") else core


def get_display_version() -> str:
    env_version = dotenv.get_dotenv_value("A0_BUILD_VERSION")
    if env_version:
        return env_version

    meta = get_version_metadata()
    display = meta.get("display_version")
    if isinstance(display, str) and display.strip():
        return display.strip()

    # Fallback: derive a sane display string from git metadata when manifest/env are missing
    try:
        # Lazy import to avoid circular dependency at module import time
        from python.helpers import git as git_helpers  # type: ignore

        gitinfo = git_helpers.get_git_info()
        label = gitinfo.get("version") or "D unknown-custom"
        # Ensure we always prefix with "Version " to match UI expectation
        if not isinstance(label, str):
            label = "D unknown-custom"
        if not label.lower().startswith("version "):
            label = f"Version {label}"
        time_str = gitinfo.get("commit_time") or "unknown"
        return f"{label} {time_str}"
    except Exception:
        # Last-resort fallback: use partially known manifest fields
        base_label = friendly_version_label(meta.get("version_id"))
        timestamp = format_timestamp(meta.get("timestamp"))
        if timestamp and timestamp != "unknown":
            return f"{base_label} {timestamp}"
        return base_label


def refresh_cache() -> None:
    """Clear memoized manifest data (useful after updates)."""

    get_version_metadata.cache_clear()  # type: ignore[attr-defined]

