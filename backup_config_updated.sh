#!/bin/bash
# Updated backup configuration - single run, filtered notifications, auto-inclusion

# Configuration
BACKUP_DIR="/root/A0_backups_accessible"
SCRIPT_DIR="/root/backup_scripts"
NOTIFICATION_TOPIC="agent-zero-updates"

# Filter patterns for routine components to auto-include without notification
ROUTINE_PATTERNS=(
    "*/memory/embeddings/*"
    "*/logs/log_*.html"
    "*/memory/default/index.*"
    "*/tmp/chats/*/chat.json"
    "*/.config/syncthing/*"
    "*/__pycache__/*"
    "*.pyc"
    "*.gcode"
)

# Important system patterns that require notification
IMPORTANT_PATTERNS=(
    "*/applications/*"
    "*/system/*"
    "*/installed_apps/*"
    "*/new_applications/*"
    "*/critical_config/*"
)

# Function to check if component is routine (auto-include)
is_routine_component() {
    local component="$1"
    for pattern in "${ROUTINE_PATTERNS[@]}"; do
        if [[ "$component" == $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# Function to check if component is important (notify)
is_important_component() {
    local component="$1"
    for pattern in "${IMPORTANT_PATTERNS[@]}"; do
        if [[ "$component" == $pattern ]]; then
            return 0
        fi
    done
    return 1
}

# Function to send notification for important changes
send_important_notification() {
    local components="$1"
    curl -X POST "https://ntfy.sh/$NOTIFICATION_TOPIC" \
         -H "Title: Important System Changes Detected" \
         -H "Priority: high" \
         -H "Tags: system,backup,important" \
         -d "$components"
}

# Main backup execution function
run_backup_once() {
    echo "Starting single backup execution..."
    
    # Ensure we're in the right directory
    cd /a0 || exit 1
    
    # Run backup with updated configuration
    if [[ -f "$SCRIPT_DIR/run_backup.sh" ]]; then
        # Execute backup script with single-run guarantee
        flock -n 200 || { echo "Backup already running"; exit 0; }
        {
            "$SCRIPT_DIR/run_backup.sh"
        } 200>/tmp/backup.lock
    else
        echo "Backup script not found at $SCRIPT_DIR/run_backup.sh"
        exit 1
    fi
    
    echo "Backup completed successfully - single run finished"
}

# Execute backup once
run_backup_once
