#!/bin/bash
# Updated component detection with intelligent filtering

# Configuration
DETECTION_DIR="/a0"
NOTIFICATION_TOPIC="agent-zero-updates"
COMPONENTS_FILE="/tmp/new_components_combined.txt"

# Routine components to auto-include (no notification)
ROUTINE_COMPONENTS=(
    "memory/embeddings"
    "memory/default/index"
    "logs/log_"
    "tmp/chats"
    ".config/syncthing"
    "__pycache__"
    "*.pyc"
    "*.gcode"
)

# Important system components (notify)
IMPORTANT_COMPONENTS=(
    "applications/"
    "system/"
    "installed_apps/"
    "new_applications/"
    "critical_config/"
    "mcp_servers/"
    "new_tools/"
    "external_services/"
)

# Function to check if component is routine
is_routine() {
    local path="$1"
    for pattern in "${ROUTINE_COMPONENTS[@]}"; do
        if [[ "$path" == *"$pattern"* ]]; then
            return 0
        fi
    done
    return 1
}

# Function to check if component is important
is_important() {
    local path="$1"
    for pattern in "${IMPORTANT_COMPONENTS[@]}"; do
        if [[ "$path" == *"$pattern"* ]]; then
            return 0
        fi
    done
    return 1
}

# Function to send notification for important changes
send_notification() {
    local important_components="$1"
    local count=$(echo "$important_components" | wc -l)
    
    curl -X POST "https://ntfy.sh/$NOTIFICATION_TOPIC" \
         -H "Title: 🚨 Important System Changes Detected" \
         -H "Priority: 4" \
         -H "Tags: system,backup,important,warning" \
         -d "Detected $count important system changes that require backup inclusion:\n\n$important_components\n\nThese will be automatically included in the next backup run."
}

# Main detection function
detect_components() {
    echo "🔍 Scanning for new components..."
    
    # Clear previous results
    > "$COMPONENTS_FILE"
    
    # Find all new/modified files in the last 24 hours
    local new_files=$(find "$DETECTION_DIR" -type f -newer /tmp/last_backup_check 2>/dev/null || find "$DETECTION_DIR" -type f -mtime -1)
    
    local important_found=""
    local routine_count=0
    
    while IFS= read -r file; do
        if [[ -n "$file" ]]; then
            if is_important "$file"; then
                important_found+="• $file\n"
                echo "IMPORTANT: $file" >> "$COMPONENTS_FILE"
            elif ! is_routine "$file"; then
                # Unknown/new type - include as important
                important_found+="• $file (new type)\n"
                echo "NEW: $file" >> "$COMPONENTS_FILE"
            else
                # Routine component - auto-include
                echo "ROUTINE: $file" >> "$COMPONENTS_FILE"
                ((routine_count++))
            fi
        fi
    done <<< "$new_files"
    
    # Update last check timestamp
    touch /tmp/last_backup_check
    
    # Handle notifications
    if [[ -n "$important_found" ]]; then
        echo "📢 Important components detected - sending notification"
        send_notification "$important_found"
        return 0  # Always proceed with backup (fix for unconditional execution)
    else
        echo "✅ Only routine components detected ($routine_count items) - auto-including"
        return 0  # Signal to proceed with backup
    fi
}

# Execute detection
detect_components
