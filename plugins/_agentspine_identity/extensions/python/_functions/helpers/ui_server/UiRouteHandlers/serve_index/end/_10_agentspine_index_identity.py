from __future__ import annotations

import os
import re

from helpers.extension import Extension
from plugins._agentspine_identity.helpers.identity import (
    apply_identity_text,
    default_release_tag,
    format_display_version,
    get_identity_config,
)


def _current_release_tag() -> str:
    config = get_identity_config()
    release_tags = config.get("release_tags") if isinstance(config, dict) else None
    release_tags = release_tags if isinstance(release_tags, dict) else {}
    variant = os.getenv("BUILD_VARIANT", "").strip().lower()
    if variant in {"fullgpu", "gpu"}:
        return str(release_tags.get("gpu_pre") or "v0.9.9-gpu-pre")
    return str(release_tags.get("standard_pre") or default_release_tag())


class AgentspineIndexIdentity(Extension):
    def execute(self, data: dict | None = None, **kwargs):
        if not isinstance(data, dict):
            return
        result = data.get("result")
        if not isinstance(result, str):
            return

        def replace_gitinfo(match: re.Match[str]) -> str:
            current_version = match.group("version")
            commit_time = match.group("time")
            display = format_display_version(
                _current_release_tag(),
                commit_time,
                None if current_version.startswith(("D ", "M ", "AS ")) else current_version,
            )
            return f'globalThis.gitinfo = {{ version: "{display}", commit_time: "{commit_time}" }};'

        result = re.sub(
            r'globalThis\.gitinfo\s*=\s*\{\s*version:\s*"(?P<version>[^"]*)",\s*commit_time:\s*"(?P<time>[^"]*)"\s*\};',
            replace_gitinfo,
            result,
            count=1,
        )
        result = result.replace("<title>Agent Zero</title>", "<title>Agentspine</title>")
        data["result"] = apply_identity_text(result)
