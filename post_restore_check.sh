#!/bin/bash
# Generalized post-restore check and MCP server reinstallation script

# Configuration
SETTINGS_FILE="/a0/tmp/settings.json"
MCP_SERVER_PATH="/a0/mcp-servers"
LOG_FILE="/tmp/post_restore_check.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Extract MCP server names from settings.json
get_mcp_servers() {
    # Extract the mcp_servers JSON string and parse it
    local mcp_servers_json=$(grep '"mcp_servers"' "$SETTINGS_FILE" | cut -d'"' -f4 | sed 's/\\\\/\\/g' | sed 's/\\"/"/g')
    
    # Extract server names from the JSON
    echo "$mcp_servers_json" | python3 -c "
import sys, json

data = json.loads(sys.stdin.read())
for server in data.get('mcpServers', {}):
    print(server.replace('-', '_'))
" 2>/dev/null || {
        log "Error parsing MCP servers from settings.json"
        # Fallback to known servers
        echo "github_mcp_server context7 filesystem knowledge_graph_memory blender_mcp unity_mcp ntfy_mcp_server discord_mcp"
    }
}

# Install MCP server based on its command
install_mcp_server() {
    local server_name="$1"
    local server_key="${server_name//_/}-server"
    
    # Extract server config from settings.json
    local server_config=$(grep '"mcp_servers"' "$SETTINGS_FILE" | cut -d'"' -f4 | sed 's/\\\\/\\/g' | sed 's/\\"/"/g' | python3 -c "
import sys, json

data = json.loads(sys.stdin.read())
server = data.get('mcpServers', {}).get('$server_key')
if server:
    print(f'{{\"command\": \"{server.get('command', '')}\", \"args\": {json.dumps(server.get('args', []))}}}')
")
    
    if [[ -z "$server_config" ]]; then
        log "Could not find configuration for $server_name"
        return 1
    fi
    
    local command=$(echo "$server_config" | python3 -c "import sys, json; print(json.loads(sys.stdin.read()).get('command', ''))")
    
    log "Installing MCP server: $server_name (command: $command)"
    
    case "$command" in
        "npx")
            # Extract package name from args
            local package=$(echo "$server_config" | python3 -c "import sys, json; args = json.loads(sys.stdin.read()).get('args', []); print([a for a in args if a.startswith('@')][0] if [a for a in args if a.startswith('@')] else args[1] if len(args) > 1 else '')")
            if [[ -n "$package" ]]; then
                npx --yes "$package"
            else
                log "Could not determine package for $server_name"
            fi
            ;;
        "uvx")
            local package=$(echo "$server_config" | python3 -c "import sys, json; args = json.loads(sys.stdin.read()).get('args', []); print(args[0] if args else '')")
            if [[ -n "$package" ]]; then
                uvx "$package"
            fi
            ;;
        "node")
            # For node servers, ensure the directory exists
            local server_dir="$MCP_SERVER_PATH/${server_name%-server}"
            mkdir -p "$server_dir"
            ;;
        "uv")
            # For uv servers, ensure the directory exists
            local server_dir="$MCP_SERVER_PATH/${server_name%-server}"
            mkdir -p "$server_dir"
            ;;
        *)
            log "Unknown command type: $command for $server_name"
            ;;
    esac
    
    # Create server directory if it doesn't exist
    local server_dir="$MCP_SERVER_PATH/${server_name%-server}"
    mkdir -p "$server_dir"
}

# Main execution
main() {
    log "Starting generalized post-restore MCP server check"
    
    # Get list of all MCP servers from configuration
    local all_servers=($(get_mcp_servers))
    local missing_servers=()
    
    log "Checking for missing MCP servers: ${all_servers[*]}"
    
    # Check each server
    for server in "${all_servers[@]}"; do
        local server_dir="$(echo "$server" | sed 's/_server$//' | sed 's/_/-/g')"
        if [[ ! -d "$MCP_SERVER_PATH/$server_dir" ]]; then
            missing_servers+=("$server")
            log "Missing MCP server: $server"
        else
            log "MCP server present: $server"
        fi
    done
    
    # Install missing servers
    if [[ ${#missing_servers[@]} -gt 0 ]]; then
        log "Installing missing MCP servers: ${missing_servers[*]}"
        
        for server in "${missing_servers[@]}"; do
            install_mcp_server "$server"
        done
        
        log "Post-restore MCP server installation completed"
    else
        log "All MCP servers are present - no installation needed"
    fi
}

# Execute main function
main "$@"