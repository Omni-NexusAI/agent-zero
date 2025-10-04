#!/bin/bash

# Wrapper script to use clean manifest with proper permissions
# Solves backup size issue without requiring root access

# Set clean manifest path
export MANIFEST_FILE="/root/backup_scripts/dynamic_backup/manifest_clean.txt"

# Verify manifest exists
if [ ! -f "$MANIFEST_FILE" ]; then
    echo "ERROR: Clean manifest not found at $MANIFEST_FILE"
    exit 1
fi

# Run original backup script with clean manifest
echo "Using clean manifest for optimized backup: $MANIFEST_FILE"
/root/backup_scripts/run_backup.sh

# Verify backup size
BACKUP_DIR="/root/A0_backups_accessible"
if [ -d "$BACKUP_DIR" ]; then
    echo "\n📊 Backup size verification:"    du -sh $BACKUP_DIR/*
fi

exit 0