#!/bin/bash
set -euo pipefail

VERSION_TAG="${1:-v0.9.9-standard-pre}"
BUILD_TYPE="${2:-standard}"
RELEASE_CHANNEL="${3:-pre}"
PUSH="${4:-}"

GHCR_REGISTRY="ghcr.io"
GHCR_USER="omni-nexusai"
IMAGE_NAME="agent-zero"
KOKORO_IMAGE_NAME="agent-zero-kokoro-worker"
CACHE_DATE="$(date +%Y-%m-%d:%H:%M:%S)"

case "$BUILD_TYPE" in
  standard)
    BUILD_VARIANT="standard"
    PYTORCH_VARIANT="cpu"
    ;;
  gpu)
    BUILD_VARIANT="fullGPU"
    PYTORCH_VARIANT="cuda"
    ;;
  *)
    echo "BUILD_TYPE must be standard or gpu" >&2
    exit 1
    ;;
esac

echo "Building Agentspine image"
echo "Image tag: $VERSION_TAG"
echo "Build type: $BUILD_TYPE"
echo "Release channel: $RELEASE_CHANNEL"
echo "Push: ${PUSH:-false}"

docker info >/dev/null

docker build \
    --build-arg GIT_REF="$VERSION_TAG" \
    --build-arg BUILD_VARIANT="$BUILD_VARIANT" \
    --build-arg RELEASE_CHANNEL="$RELEASE_CHANNEL" \
    --build-arg PYTORCH_VARIANT="$PYTORCH_VARIANT" \
    --build-arg CACHE_DATE="$CACHE_DATE" \
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$VERSION_TAG" \
    -f docker/run/Dockerfile \
    docker/run

if [ "$BUILD_TYPE" = "standard" ]; then
    docker build \
        --build-arg CACHE_DATE="$CACHE_DATE" \
        -t "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:$VERSION_TAG" \
        -f docker/Dockerfile.kokoro \
        .
fi

if [ "$PUSH" = "--push" ]; then
    docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$VERSION_TAG"
    if [ "$BUILD_TYPE" = "standard" ]; then
        docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:$VERSION_TAG"
    fi
fi

echo "Done."
