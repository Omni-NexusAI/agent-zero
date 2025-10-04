#!/bin/bash
# Master Backup Orchestrator - Single Run, Smart Filtering, Auto-inclusion

# Configuration
BACKUP_SCRIPT_PATH="/a0/backup_scripts/run_backup.sh"
MANIFEST_PATH="/a0/backup_scripts/dynamic_backup/manifest_clean.txt"
export MANIFEST_PATH
DETECTION_SCRIPT_PATH="/a0/detect_components_filtered.sh"
LOCK_FILE="/tmp/backup_orchestrator.lock"
LOG_FILE="/tmp/backup_orchestrator.log"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Ensure single execution
ensure_single_run() {
    exec 200>"$LOCK_FILE"
    flock -n 200 || {
        log "ERROR: Backup orchestrator already running"
        exit 0
    }
    log "Starting backup orchestrator - single run mode"
}

# Main orchestration function
main() {
    ensure_single_run
    
    log "🔍 Starting component detection..."
    
    # Run updated component detection
    if [[ -f "$DETECTION_SCRIPT_PATH" ]]; then
        "$DETECTION_SCRIPT_PATH"
        DETECTION_RESULT=$?
    else
        log "ERROR: Detection script not found at $DETECTION_SCRIPT_PATH"
        exit 1
    fi
    
    # Handle detection results
    case $DETECTION_RESULT in
        0)
            log "✅ Only routine components detected - proceeding with backup"
            ;;
        1)
            log "📢 Important components detected - sending Discord notification"
            
            # Extract components for notification
            COMPONENTS_PREVIEW=$(head -n 10 /tmp/new_significant_components.txt | tr '\n' ', ')
            
            # Send Discord notification
            send_discord_notification "🚨 Important System Changes Detected" "Detected important system changes that require backup inclusion:\n\n• $COMPONENTS_PREVIEW\n\nThese will be automatically included in the next backup run.\n\nTo include these components immediately, create /tmp/user_approved and run backup again." "4"
            
            log "Discord notification sent."
            
            # Check if user wants immediate inclusion
            if [[ -f "/tmp/user_approved" ]]; then
                log "User approved immediate inclusion - proceeding with backup"
                rm -f "/tmp/user_approved"
            else
                log "To include these components immediately, create /tmp/user_approved and run backup again."
                exit 0
            fi
            ;;
        *)
            log "⚠️  Detection script returned unexpected result: $DETECTION_RESULT"
            exit 1
            ;;
    esac
    
    # Execute backup if no important components detected
    log "🚀 Starting backup execution..."
    if [[ -f "$BACKUP_SCRIPT_PATH" ]]; then
        log "Executing backup script: $BACKUP_SCRIPT_PATH"
        "$BACKUP_SCRIPT_PATH"
        BACKUP_RESULT=$?
        
        if [[ $BACKUP_RESULT -eq 0 ]]; then
            log "✅ Backup completed successfully"
        else
            log "❌ Backup failed with exit code: $BACKUP_RESULT"
            exit $BACKUP_RESULT
        fi
    else
        log "ERROR: Backup script not found at $BACKUP_SCRIPT_PATH"
        exit 1
    fi
    
    log "🎉 Backup orchestrator completed - single run finished"
}

# Execute main function
main "$@"

# Execute post-restore check if this is a restore environment
if [[ -f "/tmp/restore_mode" ]]; then
    log "Restore mode detected - running post-restore MCP server check"
    /a0/post_restore_check.sh
fi

# Discord MCP notification function
send_discord_notification() {
    local title="$1"
    local message="$2"
    local priority="$3"
    
    # Use Discord MCP if available, otherwise fallback to echo
    if command -v discord_mcp.discord_post_message >/dev/null 2>&1; then
        # Get Discord channel ID from settings
        local channel_id=$(grep -o '"channel_id": "[^"]*"' /a0/tmp/settings.json | cut -d'"' -f4)
        if [[ -n "$channel_id" ]]; then
            discord_mcp.discord_post_message "$channel_id" "**$title**\n\n$message" >/dev/null 2>&1
        else
            echo "Discord notification: $title - $message"
        fi
    else
        echo "Discord notification: $title - $message"
    fi
}
