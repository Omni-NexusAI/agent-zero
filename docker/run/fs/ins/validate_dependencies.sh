#!/bin/bash
set -e

# Validate critical Python dependencies before installation
# This script ensures required package versions are correct in requirements.txt

REPO_PATH="${1:-/git/agent-zero}"
REQUIREMENTS_FILE="$REPO_PATH/requirements.txt"

if [ ! -f "$REQUIREMENTS_FILE" ]; then
    echo "ERROR: requirements.txt not found at $REQUIREMENTS_FILE"
    exit 1
fi

echo "Validating dependencies in $REQUIREMENTS_FILE..."

# Check for fastmcp version
FASTMCP_VERSION=$(grep -E "^fastmcp==" "$REQUIREMENTS_FILE" | head -1 | cut -d'=' -f3 || echo "")

if [ -z "$FASTMCP_VERSION" ]; then
    echo "WARNING: fastmcp not found in requirements.txt, adding fastmcp==2.3.0"
    echo "fastmcp==2.3.0" >> "$REQUIREMENTS_FILE"
    FASTMCP_VERSION="2.3.0"
elif [ "$FASTMCP_VERSION" != "2.3.0" ]; then
    echo "WARNING: fastmcp version is $FASTMCP_VERSION, but 2.3.0 is required"
    echo "Fixing requirements.txt to use fastmcp==2.3.0"
    # Replace any fastmcp line with the correct version
    sed -i 's/^fastmcp==.*/fastmcp==2.3.0/' "$REQUIREMENTS_FILE"
    FASTMCP_VERSION="2.3.0"
fi

echo "✓ fastmcp version validated: $FASTMCP_VERSION"

# Verify the fix worked
FINAL_VERSION=$(grep -E "^fastmcp==" "$REQUIREMENTS_FILE" | head -1 | cut -d'=' -f3)
if [ "$FINAL_VERSION" != "2.3.0" ]; then
    echo "ERROR: Failed to fix fastmcp version. Current: $FINAL_VERSION"
    exit 1
fi

echo "✓ All critical dependencies validated"








