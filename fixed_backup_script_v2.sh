#!/bin/bash

# Fixed backup script v2 - prevents archive corruption
# Solves the cpio embedding issue that was causing corrupt backups

# Set clean manifest path
export MANIFEST_FILE="/root/backup_scripts/dynamic_backup/manifest.txt"

# Verify manifest exists
if [ ! -f "$MANIFEST_FILE" ]; then
    echo "ERROR: Manifest not found at $MANIFEST_FILE"
    exit 1
fi

# Create timestamp
TIMESTAMP=$(date -u +"%Y-%m-%d_%H-%M-%S")

# Define backup directory
BACKUP_DIR="/root/A0_backups_accessible"
mkdir -p "$BACKUP_DIR"

# Determine which backup file to update (A or B) based on weekly phase rotation
WEEK_START=$(date -d "$(date -d "-$(($(date +%u)-1)) days")" +%Y-%m-%d)
WEEK_HASH=$(echo "$WEEK_START" | md5sum | cut -c1-1)
WEEK_DEC=$((0x$WEEK_HASH))

if [ $((WEEK_DEC % 2)) -eq 0 ]; then
    BACKUP_FILE="$BACKUP_DIR/agentzero_backup_A_$TIMESTAMP.tar.gz"
    ACTIVE_SLOT="A"
else
    BACKUP_FILE="$BACKUP_DIR/agentzero_backup_B_$TIMESTAMP.tar.gz"
    ACTIVE_SLOT="B"
fi

# Ensure Syncthing is running
if ! pgrep -x "syncthing" > /dev/null; then
    echo "Syncthing is not running. Starting Syncthing..."
    syncthing > /dev/null 2>&1 &
    sleep 5
fi

# Create backup with CORRECTED exclude patterns
echo "Creating backup archive: $BACKUP_FILE"

# Create temporary file with valid paths
TEMP_PATHS="/tmp/backup_paths.txt"
> "$TEMP_PATHS"

while IFS= read -r path; do
    if [ -n "$path" ] && [ -e "$path" ]; then
        echo "$path" >> "$TEMP_PATHS"
    fi
done < "$MANIFEST_FILE"

# Create backup with SPECIFIC exclude patterns (not broad ones)
if [ -s "$TEMP_PATHS" ]; then
    # Create backup tar.gz
    tar -czf "$BACKUP_FILE" -T "$TEMP_PATHS" \
        --exclude='*/node_modules/*' \
        --exclude='*/site-packages/*' \
        --exclude='*/.cache/*' \
        --exclude='*/__pycache__/*' \
        --exclude='*/.npm/*' \
        --exclude='*/venv/*' \
        --exclude='*/.git/*' \
        --exclude='*.pyc' \
        --exclude='*.log' \
        2>/dev/null
    
    # Create backup_info.txt
    echo "timestamp: $TIMESTAMP" > /tmp/backup_info.txt
    echo "active_slot: $ACTIVE_SLOT" >> /tmp/backup_info.txt
    echo "phase_start: $WEEK_START" >> /tmp/backup_info.txt
    
    # Embed backup_info.txt properly (extract, add, recompress)
    cd /tmp
    gunzip -c "$BACKUP_FILE" > backup.tar
    echo "backup_info.txt" | cpio -o -H ustar -A -F backup.tar 2>/dev/null
    gzip -c backup.tar > "$BACKUP_FILE"
    rm -f backup.tar /tmp/backup_info.txt
    cd - > /dev/null
else
    echo "Warning: No valid paths found in manifest. Creating empty backup."
    touch "$BACKUP_FILE"
fi

# Clean up temporary file
rm -f "$TEMP_PATHS"

# Verify the backup was created
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup created successfully: $BACKUP_FILE"
    echo "Backup size: $(du -sh "$BACKUP_FILE" | cut -f1)"
    
    # Clean up old backup files (keep only latest for each slot)
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
    echo "ERROR: Backup failed to create."
    exit 1
fi

exit 0