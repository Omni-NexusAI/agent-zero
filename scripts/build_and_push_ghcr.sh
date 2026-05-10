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
  standard|gpu|worker)
    ;;
  *)
    echo "BUILD_TYPE must be standard, gpu, or worker" >&2
    exit 1
    ;;
esac

docker info >/dev/null

if [ "$BUILD_TYPE" = "gpu" ]; then
    STANDARD_TAG="${STANDARD_IMAGE_TAG:-${VERSION_TAG/-gpu/-standard}}"
    STANDARD_IMAGE="${STANDARD_IMAGE:-$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$STANDARD_TAG}"

    echo "Building GPU addon image from $STANDARD_IMAGE"
    docker build \
        --build-arg STANDARD_IMAGE="$STANDARD_IMAGE" \
        --build-arg GIT_REF="$VERSION_TAG" \
        --build-arg BUILD_VARIANT="fullGPU" \
        --build-arg RELEASE_CHANNEL="$RELEASE_CHANNEL" \
        --build-arg PYTORCH_VARIANT="cuda" \
        -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$VERSION_TAG" \
        -f docker/run/Dockerfile.gpu-addon \
        .

    if [ "$PUSH" = "--push" ]; then
        docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$VERSION_TAG"
    fi
elif [ "$BUILD_TYPE" = "worker" ]; then
    echo "Building Kokoro worker image"
    docker build \
        --build-arg CACHE_DATE="$CACHE_DATE" \
        -t "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:$VERSION_TAG" \
        -f docker/Dockerfile.kokoro \
        .

    if [ "$PUSH" = "--push" ]; then
        docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:$VERSION_TAG"
    fi
else
    echo "Building standard image"
    docker build \
        --build-arg BRANCH="$VERSION_TAG" \
        --build-arg CACHE_DATE="$CACHE_DATE" \
        -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$VERSION_TAG" \
        -f docker/run/Dockerfile \
        docker/run

    if [ "$PUSH" = "--push" ]; then
        docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:$VERSION_TAG"
    fi
fi

echo "Done."
