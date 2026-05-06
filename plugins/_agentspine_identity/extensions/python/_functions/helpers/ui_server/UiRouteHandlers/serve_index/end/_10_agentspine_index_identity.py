from __future__ import annotations

import re

from helpers.extension import Extension
from plugins._agentspine_identity.helpers.identity import apply_identity_text, format_display_version


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
                "v0.9.9-standard-pre",
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
