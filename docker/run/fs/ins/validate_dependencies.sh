#!/bin/bash
set -e

REPO_PATH="${1:-/git/agent-zero}"
REQUIREMENTS_FILE="$REPO_PATH/requirements.txt"

if [ ! -f "$REQUIREMENTS_FILE" ]; then
    echo "ERROR: requirements.txt not found at $REQUIREMENTS_FILE"
    exit 1
fi

echo "Validating dependencies in $REQUIREMENTS_FILE..."

# Verify fastmcp is present
FASTMCP_LINE=$(grep -E "^fastmcp==" "$REQUIREMENTS_FILE" | head -1 || echo "")
if [ -z "$FASTMCP_LINE" ]; then
    echo "WARNING: fastmcp not found in requirements.txt"
else
    echo "Found: $FASTMCP_LINE"
fi

# Verify litellm is present
LITELLM_LINE=$(grep -E "^litellm" "$REQUIREMENTS_FILE" | head -1 || echo "")
if [ -z "$LITELLM_LINE" ]; then
    echo "WARNING: litellm not found in requirements.txt, adding it"
    echo "litellm" >> "$REQUIREMENTS_FILE"
else
    echo "Found: $LITELLM_LINE"
fi

echo "All critical dependencies validated"
