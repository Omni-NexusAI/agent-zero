#!/usr/bin/env python3
"""Archive stale Spine custom source packages before the A0 runtime starts.

The A0 loader intentionally prioritizes ``/a0/usr/plugins`` over built-ins.
Spine release images package their overlays in ``/a0/plugins``; a restored
full package in the user root would therefore shadow the release copy.  This
small release-layer migration moves only that explicit, known set of legacy
source packages out of the loader root, preserves a reversible archive, and
leaves their settings/toggle state in config-only user directories.
"""

from __future__ import annotations

import json
import os
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from shutil import move
from typing import Any


USER_PLUGIN_ROOT = Path("/a0/usr/plugins")
BACKUP_ROOT = Path("/a0/usr/agentspine-plugin-migration-backups")

# Source package IDs observed in pre-9.9 restores map to their only valid
# Spine built-in identities.  Do not expand this list without a release
# migration decision: all other user packages remain entirely user-owned.
LEGACY_SOURCE_IDS = {
    "_enhanced_speech": "_enhanced_speech",
    "enhanced_speech": "_enhanced_speech",
    "_provider_profiles": "_provider_profiles",
    "provider_profiles": "_provider_profiles",
    "_multi_source_updater": "_multi_source_updater",
    "multi_source_updater": "_multi_source_updater",
    "_agentspine_identity": "_agentspine_identity",
    "agentspine_identity": "_agentspine_identity",
    "ai_link_bridge": "ai_link_bridge",
}

# A0 v2.7 uses the toggle names below.  The older names are accepted only as
# migration input, so a restored pre-9.9 package retains the user's intent
# without leaving an ignored legacy marker in the new config-only directory.
TOGGLE_FILE_MAP = {
    ".toggle-1": ".toggle-1",
    ".toggle-0": ".toggle-0",
    ".enabled": ".toggle-1",
    ".disabled": ".toggle-0",
}
CANONICAL_TOGGLE_FILES = (".toggle-1", ".toggle-0")
MODEL_SLOTS = ("chat_model", "utility_model", "embedding_model")


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (FileNotFoundError, OSError, json.JSONDecodeError):
        return None


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _deep_merge(base: dict[str, Any], overlay: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in overlay.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def _canonical_profile_key(key: str, profile: dict[str, Any]) -> str:
    if ":" in key:
        return key
    provider = str(profile.get("provider") or "").strip().lower()
    for slot in MODEL_SLOTS:
        prefix = f"{slot}_"
        if key.startswith(prefix):
            return f"{slot}:{provider or key[len(prefix):]}"
    return key


def _normalize_provider_profiles(config: dict[str, Any]) -> dict[str, Any]:
    """Translate the retired underscore profile keys to the built-in schema."""
    raw_profiles = config.get("profiles")
    if not isinstance(raw_profiles, dict):
        return config
    profiles: dict[str, Any] = {}
    for raw_key, value in raw_profiles.items():
        if not isinstance(value, dict):
            continue
        profiles[_canonical_profile_key(str(raw_key), value)] = value
    return {"profiles": profiles}


def _preserve_runtime_state(source: Path, destination_name: str) -> None:
    destination = USER_PLUGIN_ROOT / destination_name
    source_config = _read_json(source / "config.json")
    destination_config = _read_json(destination / "config.json")

    if source_config is not None:
        if source.name == "provider_profiles":
            source_config = _normalize_provider_profiles(source_config)
        # The custom package is the currently authoritative loader source, so
        # it intentionally wins per field if both roots have state.
        merged = _deep_merge(destination_config or {}, source_config)
        _atomic_write_json(destination / "config.json", merged)

    for source_name, toggle_name in TOGGLE_FILE_MAP.items():
        source_toggle = source / source_name
        if source_toggle.exists():
            destination.mkdir(parents=True, exist_ok=True)
            (destination / toggle_name).touch(exist_ok=True)
            for opposite in CANONICAL_TOGGLE_FILES:
                if opposite != toggle_name:
                    (destination / opposite).unlink(missing_ok=True)
            # Only one toggle state is meaningful; retain the first current
            # marker in the source's stable preference order above.
            break


def main() -> int:
    if os.environ.get("AGENTSPINE_RELEASE") != "9.9":
        return 0
    if not USER_PLUGIN_ROOT.is_dir():
        return 0

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archive_plugins = BACKUP_ROOT / timestamp / "plugins"
    migrated: list[dict[str, str]] = []

    for source_name, destination_name in LEGACY_SOURCE_IDS.items():
        source = USER_PLUGIN_ROOT / source_name
        # A config-only directory is valid user state, not a custom package.
        if not (source / "plugin.yaml").is_file():
            continue

        _preserve_runtime_state(source, destination_name)
        archive_plugins.mkdir(parents=True, exist_ok=True)
        archive = archive_plugins / source_name
        if archive.exists():
            raise RuntimeError(f"Archive collision for {source_name}: {archive}")
        move(str(source), str(archive))
        migrated.append({"source": source_name, "builtin": destination_name, "archive": str(archive)})
        print(f"Archived stale Spine custom package {source_name} -> {archive}", flush=True)

    if migrated:
        _atomic_write_json(BACKUP_ROOT / timestamp / "migration.json", {"migrated": migrated})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
