from typing import Any

from python.helpers.api import ApiHandler, Request, Response
from python.helpers.mcp_handler import MCPConfig
from python.helpers.settings import set_settings_delta


class McpServersToggle(ApiHandler):
    async def process(
        self, input: dict[Any, Any], request: Request
    ) -> dict[Any, Any] | Response:
        config_str = input.get("mcp_servers", "")
        server_name = input.get("server_name")

        if not server_name:
            return {"success": False, "error": "server_name is required"}

        try:
            set_settings_delta({"mcp_servers": config_str}, apply=False)
            MCPConfig.apply_single_server(config_str, server_name)
            status = MCPConfig.get_instance().get_servers_status()
            return {"success": True, "status": status}
        except Exception as exc:
            return {"success": False, "error": str(exc)}



