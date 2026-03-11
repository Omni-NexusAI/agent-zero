#!/bin/bash
set -e

# Compute build version from git repository and set as environment variable
# This script is run during Docker build after the repo is cloned

REPO_PATH="${1:-/git/agent-zero}"

normalize_variant_slug() {
    case "${1:-}" in
        hybridGPU|hybridgpu)
            echo "hybrid-gpu"
            ;;
        fullGPU|fullgpu)
            echo "full-gpu"
            ;;
        standard)
            echo "standard"
            ;;
        cpu)
            echo "cpu"
            ;;
        *)
            echo ""
            ;;
    esac
}

build_variant_prefix() {
    local variant_slug="${1:-}"
    local version_id="${2:-}"
    if [ -n "$variant_slug" ] && [ -n "$version_id" ] && [[ "$version_id" == *"$variant_slug"* ]]; then
        echo ""
        return
    fi
    if [ -n "$variant_slug" ]; then
        echo "${variant_slug} "
        return
    fi
    echo ""
}

VARIANT_SLUG=$(normalize_variant_slug "${BUILD_VARIANT:-}")
RELEASE_CHANNEL="${RELEASE_CHANNEL:-pre}"
if [ "$RELEASE_CHANNEL" = "release" ]; then
    VERSION_PREFIX="Version M"
else
    VERSION_PREFIX="Version D"
fi

if [ ! -d "$REPO_PATH/.git" ]; then
    if [ -n "${BUILD_VERSION_ID:-}" ]; then
        DISPLAY_VERSION="${VERSION_PREFIX} ${BUILD_VERSION_ID} $(date +"%Y-%m-%d %H:%M:%S")"
    else
        VARIANT_PREFIX=$(build_variant_prefix "$VARIANT_SLUG" "")
        DISPLAY_VERSION="${VERSION_PREFIX} ${VARIANT_PREFIX}local-dev-custom $(date +"%Y-%m-%d %H:%M:%S")"
    fi
    echo "$DISPLAY_VERSION" > /tmp/A0_BUILD_VERSION.txt
    echo "No git repo found, using local version: $DISPLAY_VERSION" >&2
    echo "$DISPLAY_VERSION"
    exit 0
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
    VARIANT_PREFIX=$(build_variant_prefix "$VARIANT_SLUG" "$VERSION_ID")
    # Format: Version D [variant] <tag> <timestamp>
    # If tag already contains -custom, use as-is; otherwise add -custom
    if [[ "$VERSION_ID" == *"-custom"* ]]; then
        DISPLAY_VERSION="${VERSION_PREFIX} ${VARIANT_PREFIX}${VERSION_ID} ${GIT_TIMESTAMP}"
    else
        DISPLAY_VERSION="${VERSION_PREFIX} ${VARIANT_PREFIX}${VERSION_ID}-custom ${GIT_TIMESTAMP}"
    fi
else
    # If not on a tag, use commit hash
    # Format: Version D [variant] dev-<commit>-custom <timestamp>
    VARIANT_PREFIX=$(build_variant_prefix "$VARIANT_SLUG" "")
    DISPLAY_VERSION="${VERSION_PREFIX} ${VARIANT_PREFIX}dev-${GIT_COMMIT}-custom ${GIT_TIMESTAMP}"
fi

# Export for use in Docker build
echo "$DISPLAY_VERSION" > /tmp/A0_BUILD_VERSION.txt
echo "Computed build version: $DISPLAY_VERSION" >&2
echo "$DISPLAY_VERSION"
