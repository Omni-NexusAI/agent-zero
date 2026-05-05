from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any


PLUGIN_DIR = Path(__file__).resolve().parents[1]
DEFAULTS = {
    "product_name": "Agentspine",
    "short_name": "AS",
    "banner_prefix": "D",
    "main_release_prefix": "M",
    "development_prefix": "D",
    "compatibility_label": "A0-compatible",
    "default_release_tag": "v0.9.9-standard-pre",
}

PROTECTED_PHRASES = {
    "Agent Zero Venice": "__AS_IDENTITY_AGENT_ZERO_VENICE__",
}

REPLACEMENTS = (
    ("Agent-Zero", "Agentspine"),
    ("AgentZero", "Agentspine"),
    ("Agent Zero", "Agentspine"),
    ("agent-zero", "agentspine"),
    ("agent zero", "Agentspine"),
    ("A0 MCP Server", "AS MCP Server"),
    ("A0 A2A Server", "AS A2A Server"),
    ("A0 instance", "AS instance"),
    ("A0-compatible", "A0-compatible"),
)


@lru_cache(maxsize=1)
def get_identity_config() -> dict[str, Any]:
    config = dict(DEFAULTS)
    config_path = PLUGIN_DIR / "default_config.yaml"
    if config_path.exists():
        loaded = _load_simple_yaml(config_path)
        config.update({k: v for k, v in loaded.items() if v not in (None, "")})
    return config


def _load_simple_yaml(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {}
    current_map: str | None = None
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line.startswith(" ") and line.endswith(":"):
            current_map = line[:-1].strip()
            result[current_map] = {}
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if line.startswith(" ") and current_map and isinstance(result.get(current_map), dict):
            result[current_map][key] = value
        else:
            current_map = None
            result[key] = value
    return result


def default_release_tag() -> str:
    return str(get_identity_config().get("default_release_tag") or DEFAULTS["default_release_tag"])


def normalize_release_tag(version_id: str | None) -> str:
    raw = (version_id or "").strip()
    if not raw:
        return default_release_tag()
    if raw == "v0.9.9-pre":
        return default_release_tag()
    return raw


def format_timestamp(value: str | None) -> str:
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return parsed.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def friendly_version_label(version_id: str | None) -> str:
    prefix = str(get_identity_config().get("banner_prefix") or DEFAULTS["banner_prefix"])
    return f"{prefix} {normalize_release_tag(version_id)}"


def format_display_version(
    version_id: str | None,
    timestamp: str | None = None,
    existing_display: str | None = None,
) -> str:
    existing = (existing_display or "").strip()
    if existing.startswith(("D ", "M ", "AS ")):
        return existing
    label = friendly_version_label(version_id)
    formatted_time = format_timestamp(timestamp)
    return f"{label} {formatted_time}".strip()


def apply_identity_text(text: str) -> str:
    if not isinstance(text, str) or not text:
        return text

    result = text
    for phrase, token in PROTECTED_PHRASES.items():
        result = result.replace(phrase, token)
    for source, target in REPLACEMENTS:
        result = result.replace(source, target)
    for phrase, token in PROTECTED_PHRASES.items():
        result = result.replace(token, phrase)
    return result
