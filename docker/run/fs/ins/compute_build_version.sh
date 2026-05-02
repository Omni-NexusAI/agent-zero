#!/bin/bash
set -e

REPO_PATH="${1:-/git/agent-zero}"

normalize_variant_slug() {
    case "${1:-}" in
        fullGPU|fullgpu|gpu)
            echo "gpu"
            ;;
        standard|cpu)
            echo "standard"
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

normalize_build_version_id() {
    local raw="${1:-}"
    while true; do
        local prev="$raw"
        raw="${raw%-rebake-local}"
        raw="${raw%-local}"
        raw="${raw%-dev}"
        [ "$raw" = "$prev" ] && break
    done
    echo "$raw"
}

format_git_timestamp() {
    local raw="${1:-}"
    if [ -z "$raw" ]; then
        echo "unknown"
    elif date -d "$raw" +"%Y-%m-%d %H:%M:%S" >/dev/null 2>&1; then
        date -d "$raw" +"%Y-%m-%d %H:%M:%S"
    else
        echo "$raw" | cut -d' ' -f1,2
    fi
}

VARIANT_SLUG=$(normalize_variant_slug "${BUILD_VARIANT:-standard}")
VERSION_PREFIX="AS"

if [ ! -d "$REPO_PATH/.git" ]; then
    if [ -n "${BUILD_VERSION_ID:-}" ]; then
        VERSION_ID=$(normalize_build_version_id "$BUILD_VERSION_ID")
    else
        VERSION_ID="local-dev"
    fi
    VARIANT_PREFIX=$(build_variant_prefix "$VARIANT_SLUG" "$VERSION_ID")
    DISPLAY_VERSION="${VERSION_PREFIX} ${VARIANT_PREFIX}${VERSION_ID} $(date +"%Y-%m-%d %H:%M:%S")"
    echo "$DISPLAY_VERSION" > /tmp/A0_BUILD_VERSION.txt
    echo "No git repo found, using local version: $DISPLAY_VERSION" >&2
    echo "$DISPLAY_VERSION"
    exit 0
fi

cd "$REPO_PATH"

GIT_TAG=$(git describe --exact-match --tags HEAD 2>/dev/null || git describe --tags --abbrev=0 HEAD 2>/dev/null || echo "")
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_TIMESTAMP=$(format_git_timestamp "$(git log -1 --format=%ci HEAD 2>/dev/null || echo "")")

if [ -n "${GIT_REF:-}" ] && [[ "$GIT_REF" =~ ^v[0-9] ]]; then
    VERSION_ID="$GIT_REF"
elif [ -n "$GIT_TAG" ]; then
    VERSION_ID="$GIT_TAG"
else
    VERSION_ID="dev-${GIT_COMMIT}"
fi

VARIANT_PREFIX=$(build_variant_prefix "$VARIANT_SLUG" "$VERSION_ID")
DISPLAY_VERSION="${VERSION_PREFIX} ${VARIANT_PREFIX}${VERSION_ID} ${GIT_TIMESTAMP}"

echo "$DISPLAY_VERSION" > /tmp/A0_BUILD_VERSION.txt
echo "Computed build version: $DISPLAY_VERSION" >&2
echo "$DISPLAY_VERSION"
