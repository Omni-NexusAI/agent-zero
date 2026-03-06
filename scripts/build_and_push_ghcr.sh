#!/bin/bash
set -e

# Script to build and push all three build variants to GitHub Container Registry
# Usage: ./scripts/build_and_push_ghcr.sh [VERSION_TAG]
# Example: ./scripts/build_and_push_ghcr.sh v0.9.8-custom-pre

VERSION_TAG="${1:-v0.9.8-custom-pre}"
GHCR_REGISTRY="ghcr.io"
GHCR_USER="omni-nexusai"
IMAGE_NAME="agent-zero"
KOKORO_IMAGE_NAME="agent-zero-kokoro-worker"

echo "Building and pushing Agent Zero images to GHCR"
echo "Version tag: $VERSION_TAG"
echo "Registry: $GHCR_REGISTRY/$GHCR_USER"

# Check if user is logged in to GHCR
if ! docker info | grep -q "$GHCR_REGISTRY"; then
    echo "Please login to GitHub Container Registry first:"
    echo "  echo \$GITHUB_TOKEN | docker login $GHCR_REGISTRY -u USERNAME --password-stdin"
    echo "Or use: docker login $GHCR_REGISTRY"
    exit 1
fi

# Build CPU-only variant
echo ""
echo "=== Building CPU-only variant ==="
docker build \
    --build-arg GIT_REF=$VERSION_TAG \
    --build-arg BUILD_VARIANT="" \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-cpu \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-cpu-latest \
    -f docker/run/Dockerfile \
    docker/run

# Build Full GPU variant
echo ""
echo "=== Building Full GPU variant ==="
docker build \
    --build-arg GIT_REF=$VERSION_TAG \
    --build-arg BUILD_VARIANT=fullGPU \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-fullgpu \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-fullgpu-latest \
    -f docker/run/Dockerfile \
    docker/run

# Build Hybrid GPU variant (main container)
echo ""
echo "=== Building Hybrid GPU variant (main container) ==="
docker build \
    --build-arg GIT_REF=$VERSION_TAG \
    --build-arg BUILD_VARIANT=hybridGPU \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-hybrid-gpu \
    -t $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-hybrid-gpu-latest \
    -f docker/run/Dockerfile \
    docker/run

# Build Kokoro GPU worker
echo ""
echo "=== Building Kokoro GPU worker ==="
docker build \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    -t $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG} \
    -t $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}-latest \
    -f docker/Dockerfile.kokoro \
    .

# Push all images
echo ""
echo "=== Pushing images to GHCR ==="
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-cpu
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-cpu-latest
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-fullgpu
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-fullgpu-latest
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-hybrid-gpu
docker push $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-hybrid-gpu-latest
docker push $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}
docker push $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}-latest

echo ""
echo "=== Success! All images pushed to GHCR ==="
echo ""
echo "CPU-only:    $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-cpu"
echo "Full GPU:    $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-fullgpu"
echo "Hybrid GPU:  $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}-hybrid-gpu"
echo "Kokoro:      $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}"

