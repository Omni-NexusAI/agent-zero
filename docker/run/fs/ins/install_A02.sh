#!/bin/bash
set -e

# cachebuster script, this helps speed up docker builds

# remove repo (if not local branch)
if [ "$1" != "local" ]; then
    rm -rf /git/agent-zero
fi

# run the original install script again (this will recompute version)
bash /ins/install_A0.sh "$@"

# Recompute and save build version after reinstall
# BUILD_VARIANT env var is inherited from Dockerfile (hybridGPU, fullGPU, or empty)
if [ -d /git/agent-zero/.git ]; then
    echo "Recomputing build version after reinstall (variant: ${BUILD_VARIANT:-cpu-only})..."
    BUILD_VERSION=$(BUILD_VARIANT="$BUILD_VARIANT" bash /ins/compute_build_version.sh /git/agent-zero | tr -d '\n\r')
    echo "$BUILD_VERSION" > /tmp/A0_BUILD_VERSION.txt
    echo "Build version recomputed: $BUILD_VERSION"
fi

# remove python packages cache
. "/ins/setup_venv.sh" "$@"
pip cache purge
uv cache prune