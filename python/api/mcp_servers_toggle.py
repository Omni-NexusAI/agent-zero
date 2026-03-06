from python.helpers.api import ApiHandler, Request, Response

from typing import Any

from python.helpers.settings import set_settings_delta


class McpServersToggle(ApiHandler):
    async def process(self, input: dict[Any, Any], request: Request) -> dict[Any, Any] | Response:
        config_str = input["mcp_servers"]
        server_name = input.get("server_name")
        if not server_name:
            return {"success": False, "error": "server_name is required"}
        try:
            set_settings_delta({"mcp_servers": config_str})
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
