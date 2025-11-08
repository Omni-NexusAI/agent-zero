#!/bin/bash
set -e

# Compute build version from git repository and set as environment variable
# This script is run during Docker build after the repo is cloned

REPO_PATH="${1:-/git/agent-zero}"

if [ ! -d "$REPO_PATH/.git" ]; then
    echo "ERROR: Not a git repository: $REPO_PATH" >&2
    exit 1
fi

cd "$REPO_PATH"

# Get git tag (if on a tag)
# Try exact match first, then describe (which includes commits after tag)
GIT_TAG=$(git describe --exact-match --tags HEAD 2>/dev/null || git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")

# Get git commit hash (short)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Get commit timestamp
GIT_TIMESTAMP=$(git log -1 --format=%ci HEAD 2>/dev/null || echo "")
if [ -n "$GIT_TIMESTAMP" ]; then
    # Format timestamp: YYYY-MM-DD HH:MM:SS
    # Try GNU date first (Linux), then fall back to other methods
    if date -d "$GIT_TIMESTAMP" +"%Y-%m-%d %H:%M:%S" >/dev/null 2>&1; then
        GIT_TIMESTAMP=$(date -d "$GIT_TIMESTAMP" +"%Y-%m-%d %H:%M:%S")
    elif date -j -f "%Y-%m-%d %H:%M:%S %z" "$GIT_TIMESTAMP" +"%Y-%m-%d %H:%M:%S" >/dev/null 2>&1; then
        # macOS/BSD date
        GIT_TIMESTAMP=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$GIT_TIMESTAMP" +"%Y-%m-%d %H:%M:%S")
    else
        # Fallback: extract and format manually
        GIT_TIMESTAMP=$(echo "$GIT_TIMESTAMP" | cut -d' ' -f1,2 | sed 's/ / /')
    fi
else
    GIT_TIMESTAMP="unknown"
fi

# Determine version string
if [ -n "$GIT_TAG" ]; then
    # If on a tag, use the tag name
    # Remove 'v' prefix if present for display
    VERSION_ID="${GIT_TAG#v}"
    # Format: Version D <tag>-custom <timestamp>
    # Remove any existing -custom suffix to avoid duplication
    VERSION_ID="${VERSION_ID%-custom}"
    DISPLAY_VERSION="Version D ${VERSION_ID}-custom ${GIT_TIMESTAMP}"
else
    # If not on a tag, use commit hash
    # Format: Version D dev-<commit>-custom <timestamp>
    DISPLAY_VERSION="Version D dev-${GIT_COMMIT}-custom ${GIT_TIMESTAMP}"
fi

# Export for use in Docker build
echo "$DISPLAY_VERSION" > /tmp/A0_BUILD_VERSION.txt
echo "Computed build version: $DISPLAY_VERSION" >&2
echo "$DISPLAY_VERSION"
