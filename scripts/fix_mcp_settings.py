import json
import os
from typing import Any, Dict


def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: str, data: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def main() -> None:
    settings_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "tmp",
        "settings.json",
    )

    settings = load_json(settings_path)

    # Normalize mcpServers structure
    if "mcpServers" not in settings:
        raw = settings.get("mcp_servers")
        if isinstance(raw, str):
            try:
                obj = json.loads(raw)
            except Exception as e:
                raise SystemExit(f"Inner mcp_servers invalid JSON: {e}")
            settings["mcpServers"] = obj.get("mcpServers", obj)
            del settings["mcp_servers"]
        elif isinstance(raw, dict):
            settings["mcpServers"] = raw
            del settings["mcp_servers"]

    servers = settings.setdefault("mcpServers", {})

    # Configure unity-mcp to run from local source via uv with stdio transport
    unity = servers.setdefault("unity-mcp", {})
    unity.setdefault("description", "Unity MCP Server for game development")
    unity["command"] = "uv"
    unity["args"] = [
        "run",
        "--directory",
        "/a0/tmp/unity-mcp/UnityMcpServer/src",
        "server.py",
    ]
    env = unity.setdefault("env", {})
    env["MCP_TRANSPORT"] = "stdio"
    unity["init_timeout"] = 10
    unity["tool_timeout"] = 200

    # Save a backup and write new settings
    backup_path = settings_path + ".bak"
    try:
        if os.path.exists(backup_path):
            os.remove(backup_path)
    except Exception:
        pass
    os.replace(settings_path, backup_path)
    save_json(settings_path, settings)
    print("OK: settings.json updated; backup at", backup_path)


if __name__ == "__main__":
    main()


