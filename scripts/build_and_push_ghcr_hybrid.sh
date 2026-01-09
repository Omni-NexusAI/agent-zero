#!/bin/bash
set -e

# Script to build and push Hybrid GPU build variant to GitHub Container Registry
# Usage: ./scripts/build_and_push_ghcr_hybrid.sh [VERSION_TAG]
# Example: ./scripts/build_and_push_ghcr_hybrid.sh v0.9.8-custom-pre-hybrid-gpu

VERSION_TAG="${1:-v0.9.8-custom-pre-hybrid-gpu}"
GHCR_REGISTRY="ghcr.io"
GHCR_USER="omni-nexusai"
IMAGE_NAME="agent-zero"
KOKORO_IMAGE_NAME="agent-zero-kokoro-worker"

echo "Building and pushing Hybrid GPU build to GHCR"
echo "Version tag: $VERSION_TAG"
echo "Registry: $GHCR_REGISTRY/$GHCR_USER"
echo ""

# Build Hybrid GPU variant (main container)
echo "=== Building Hybrid GPU variant (main container) ==="
docker build \
    --build-arg GIT_REF=$VERSION_TAG \
    --build-arg BUILD_VARIANT=hybridGPU \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    --no-cache \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG} \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-latest \
    -f docker/run/Dockerfile \
    docker/run

if [ $? -ne 0 ]; then
    echo "Error: Hybrid GPU build failed"
    exit 1
fi

# Build Kokoro GPU worker
echo ""
echo "=== Building Kokoro GPU worker ==="
docker build \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    --no-cache \
    -t $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG} \
    -t $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}-latest \
    -f docker/Dockerfile.kokoro \
    .

if [ $? -ne 0 ]; then
    echo "Error: Kokoro worker build failed"
    exit 1
fi

# Push all images
echo ""
echo "=== Pushing images to GHCR ==="
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-latest
docker push $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}
docker push $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}-latest

echo ""
echo "=== Success! Hybrid GPU images pushed to GHCR ==="
echo ""
echo "Hybrid GPU:  $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}"
echo "Kokoro:      $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}"
