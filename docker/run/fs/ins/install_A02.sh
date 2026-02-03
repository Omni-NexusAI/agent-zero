#!/bin/bash
set -e

# OPTIMIZED cachebuster script - refreshes code ONLY, does NOT reinstall dependencies
# This prevents creating duplicate multi-GB layers in Docker
# The goal is to bust the cache to pull latest code without re-running pip install

GIT_REF="$1"

# Detect if GIT_REF is a tag
IS_TAG=false
if [[ "$GIT_REF" =~ ^v[0-9] ]] || [[ "$GIT_REF" =~ -custom$ ]] || [[ "$GIT_REF" =~ ^v[0-9]+\.[0-9] ]]; then
    IS_TAG=true
fi

if [ "$GIT_REF" != "local" ] && [ -d /git/agent-zero/.git ]; then
    echo "Refreshing A0 code (preserving installed dependencies)..."
    cd /git/agent-zero
    
    # Fetch latest changes
    git fetch origin --tags --force
    
    # Reset to the target ref
    if [ "$IS_TAG" = true ]; then
        echo "Checking out tag: $GIT_REF"
        git checkout "$GIT_REF" --force
    else
        echo "Resetting to branch: $GIT_REF"
        git checkout "$GIT_REF" --force 2>/dev/null || git checkout -b "$GIT_REF" "origin/$GIT_REF" --force
        git reset --hard "origin/$GIT_REF"
    fi
    
    echo "Code refreshed successfully"
elif [ "$GIT_REF" = "local" ]; then
    echo "Using local development files (no refresh needed)"
elif [ ! -d /git/agent-zero ]; then
    echo "No existing A0 installation found, running full install..."
    bash /ins/install_A0.sh "$@"
fi

# Recompute and save build version
# BUILD_VARIANT env var is inherited from Dockerfile (hybridGPU, fullGPU, or empty)
if [ -d /git/agent-zero/.git ]; then
    echo "Recomputing build version (variant: ${BUILD_VARIANT:-cpu-only})..."
    BUILD_VERSION=$(BUILD_VARIANT="$BUILD_VARIANT" bash /ins/compute_build_version.sh /git/agent-zero | tr -d '\n\r')
    echo "$BUILD_VERSION" > /tmp/A0_BUILD_VERSION.txt
    echo "Build version recomputed: $BUILD_VERSION"
fi

# Activate venv and clean caches
. "/ins/setup_venv.sh" "$@"
pip cache purge
uv cache prune
