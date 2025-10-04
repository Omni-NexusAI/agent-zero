#!/bin/bash

# Lock file to prevent concurrent execution
LOCK_FILE="/tmp/backup_script.lock"

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

# Function to run the actual backup
run_backup() {
echo "Starting backup process at $(date)"

# Create timestamp
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")

# Define backup directory
BACKUP_DIR="/root/A0_backups_accessible"
mkdir -p "$BACKUP_DIR"

# Determine which backup file to update (A or B) based on weekly phase rotation
# Get the start of the current week (Monday)
WEEK_START=$(date -d "$(date -d "-$(($(date +%u)-1)) days")" +%Y-%m-%d)
# Use a simple hash of the week start to determine which slot to update
WEEK_HASH=$(echo "$WEEK_START" | md5sum | cut -c1-1)
# Convert hex to decimal and use even/odd to determine slot
WEEK_DEC=$((0x$WEEK_HASH))

if [ $((WEEK_DEC % 2)) -eq 0 ]; then
# Even week - update slot A
BACKUP_FILE="$BACKUP_DIR/agentzero_backup_A_$TIMESTAMP.tar.gz"
ACTIVE_SLOT="A"
else
# Odd week - update slot B
BACKUP_FILE="$BACKUP_DIR/agentzero_backup_B_$TIMESTAMP.tar.gz"
ACTIVE_SLOT="B"
fi

# Create backup_info.txt with metadata
echo "timestamp: $TIMESTAMP" > /tmp/backup_info.txt
echo "active_slot: $ACTIVE_SLOT" >> /tmp/backup_info.txt
echo "phase_start: $WEEK_START" >> /tmp/backup_info.txt

# Ensure Syncthing is running
if ! pgrep -x "syncthing" > /dev/null; then
echo "Syncthing is not running. Starting Syncthing..."
syncthing > /dev/null 2>&1 &
sleep 5
fi

# Create the backup archive using the manifest
echo "Creating backup archive: $BACKUP_FILE"
# Use the manifest file to determine what to include
if [ -f "/root/backup_scripts/dynamic_backup/manifest.txt" ]; then
# Use tar with the manifest file to selectively backup only specified paths
MANIFEST_FILE="/root/backup_scripts/dynamic_backup/manifest.txt"
# Create a temporary file with the list of paths to backup
TEMP_PATHS="/tmp/backup_paths.txt"
> "$TEMP_PATHS"

# Process the manifest file to create a list of valid paths
while IFS= read -r path; do
if [ -n "$path" ] && [ -e "$path" ]; then
echo "$path" >> "$TEMP_PATHS"
fi
done < "$MANIFEST_FILE"

# Create the backup using tar with the list of paths
if [ -s "$TEMP_PATHS" ]; then
tar -czf "$BACKUP_FILE" -T "$TEMP_PATHS" --exclude='*.log' --exclude='*.cache' --exclude='tmp' --exclude='__pycache__' --exclude='*.pyc' --exclude='*.gcode' 2>/dev/null
else
echo "Warning: No valid paths found in manifest. Creating empty backup."
touch "$BACKUP_FILE"
fi

# Clean up temporary file
rm -f "$TEMP_PATHS"
else
echo "Warning: Manifest file not found. Using default paths."
find /a0 /root -print0 | cpio -0 -o -H ustar | gzip -9 > "$BACKUP_FILE"
fi

# Embed backup_info.txt into the archive
echo "/tmp/backup_info.txt" | cpio -o -H ustar -F "$BACKUP_FILE"

# Clean up temporary file
rm /tmp/backup_info.txt

# Verify the backup was created
if [ -f "$BACKUP_FILE" ]; then
echo "Backup created successfully: $BACKUP_FILE"
# Keep only the two most recent backup files for each slot
# This ensures we have exactly two files: one A and one B

echo "Cleaning up old backup files..."

# Remove extra A files
A_FILES_COUNT=$(ls -1 $BACKUP_DIR/agentzero_backup_A_*.tar.gz 2>/dev/null | wc -l)
if [ "$A_FILES_COUNT" -gt 1 ]; then
A_FILES_TO_REMOVE=$(ls -t $BACKUP_DIR/agentzero_backup_A_*.tar.gz 2>/dev/null | tail -n +2)
for file in $A_FILES_TO_REMOVE; do
if [ -f "$file" ]; then
echo "Removing old A file: $file"
rm -f "$file"
fi
done
fi

# Remove extra B files
B_FILES_COUNT=$(ls -1 $BACKUP_DIR/agentzero_backup_B_*.tar.gz 2>/dev/null | wc -l)
if [ "$B_FILES_COUNT" -gt 1 ]; then
B_FILES_TO_REMOVE=$(ls -t $BACKUP_DIR/agentzero_backup_B_*.tar.gz 2>/dev/null | tail -n +2)
for file in $B_FILES_TO_REMOVE; do
if [ -f "$file" ]; then
echo "Removing old B file: $file"
rm -f "$file"
fi
done
fi

echo "Backup cleanup complete."
else
echo "Error: Backup creation failed."
exit 1
fi

echo "Backup process completed at $(date)"
}

# Acquire lock
if ! exec 200> "$LOCK_FILE"; then
echo "Failed to open lock file."
exit 1
fi

if ! flock -n 200; then
echo "Another instance is already running. Exiting."
exit 0
fi

# Always run the first backup immediately
run_backup

# Now check for significant new components
echo "Checking for significant new components..."
/root/backup_scripts/dynamic_backup/detect_significant_components.sh

# If significant components were detected, notify the user and exit immediately
# Do not wait for approval in this run
if [ -s /tmp/new_significant_components.txt ]; then
echo "Significant new components detected. Notifying user and exiting."

# Extract the first few lines of new components for the notification
COMPONENTS_PREVIEW=$(head -n 5 /tmp/new_significant_components.txt | tr '\n' ', ')

# Send notification via Discord
send_discord_notification "🚨 Important System Changes Detected" "Detected important system changes that require backup inclusion:\n\n$COMPONENTS_PREVIEW\n\nThese will be automatically included in the next backup run." "4"

echo "Notification sent. Exiting without waiting for approval."
echo "To approve and run a second backup with new components, create the file /tmp/user_approved and run the backup script again."
else
echo "No significant new components detected. No additional backup needed."
fi

# Update the timestamp file for next run
date > /root/backup_scripts/last_backup_timestamp

# Release lock
exec 200<&-
exec 200>&-