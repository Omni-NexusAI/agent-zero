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

# Backup existing tags to prevent tag loss if build is interrupted
MAIN_TAG="$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME:${VERSION_TAG}"
TEMP_TAG="${MAIN_TAG}-temp-$(date +%Y%m%d%H%M%S)"
BACKUP_TAG="${MAIN_TAG}-backup-$(date +%Y%m%d%H%M%S)"

# Check if main tag exists and backup it if needed
EXISTING_IMAGE=$(docker images -q "$MAIN_TAG" 2>/dev/null)
if [ -n "$EXISTING_IMAGE" ]; then
    echo "Existing image found for tag: $MAIN_TAG"
    echo "Creating backup tag to prevent tag loss during build..."
    docker tag "$MAIN_TAG" "$BACKUP_TAG" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✓ Backup tag created: $BACKUP_TAG"
    fi
fi

# Build Hybrid GPU variant (main container) with temporary tag first
echo "=== Building Hybrid GPU variant (main container) ==="
echo "Building with temporary tag first: $TEMP_TAG"
docker build \
    --build-arg GIT_REF=$VERSION_TAG \
    --build-arg BUILD_VARIANT=hybridGPU \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    --no-cache \
    -t "$TEMP_TAG" \
    -f docker/run/Dockerfile \
    docker/run

if [ $? -ne 0 ]; then
    echo "Error: Hybrid GPU build failed"
    echo "Temporary image tag preserved: $TEMP_TAG"
    exit 1
fi

# Build succeeded - tag the new image with final tags
echo "Build successful. Tagging with final tags..."
docker tag "$TEMP_TAG" "$MAIN_TAG" || { echo "Error: Failed to tag image with $MAIN_TAG"; exit 1; }
docker tag "$TEMP_TAG" "${MAIN_TAG}-latest" || { echo "Error: Failed to tag image with ${MAIN_TAG}-latest"; exit 1; }
echo "✓ Images tagged successfully"

# Remove temporary tag (optional, keeps image list cleaner)
docker rmi "$TEMP_TAG" 2>/dev/null && echo "✓ Temporary tag removed" || true

# Optionally remove backup tag if new build succeeded
if [ -n "$BACKUP_TAG" ]; then
    echo "Removing old backup tag: $BACKUP_TAG"
    docker rmi "$BACKUP_TAG" 2>/dev/null && echo "✓ Old backup tag removed" || true
fi

# Build Kokoro GPU worker (same protection as main image)
KOKORO_TAG="$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME:${VERSION_TAG}"
KOKORO_TEMP_TAG="${KOKORO_TAG}-temp-$(date +%Y%m%d%H%M%S)"
KOKORO_BACKUP_TAG="${KOKORO_TAG}-backup-$(date +%Y%m%d%H%M%S)"

# Check if Kokoro tag exists and backup it if needed
EXISTING_KOKORO=$(docker images -q "$KOKORO_TAG" 2>/dev/null)
if [ -n "$EXISTING_KOKORO" ]; then
    echo "Existing Kokoro image found for tag: $KOKORO_TAG"
    echo "Creating backup tag..."
    docker tag "$KOKORO_TAG" "$KOKORO_BACKUP_TAG" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "✓ Backup tag created: $KOKORO_BACKUP_TAG"
    fi
fi

echo ""
echo "=== Building Kokoro GPU worker ==="
echo "Building with temporary tag first: $KOKORO_TEMP_TAG"
docker build \
    --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
    --no-cache \
    -t "$KOKORO_TEMP_TAG" \
    -f docker/Dockerfile.kokoro \
    .

if [ $? -ne 0 ]; then
    echo "Error: Kokoro worker build failed"
    echo "Temporary image tag preserved: $KOKORO_TEMP_TAG"
    exit 1
fi

# Kokoro build succeeded - tag with final tags
echo "Build successful. Tagging with final tags..."
docker tag "$KOKORO_TEMP_TAG" "$KOKORO_TAG" || { echo "Error: Failed to tag Kokoro image with $KOKORO_TAG"; exit 1; }
docker tag "$KOKORO_TEMP_TAG" "${KOKORO_TAG}-latest" || { echo "Error: Failed to tag Kokoro image with ${KOKORO_TAG}-latest"; exit 1; }
echo "✓ Kokoro images tagged successfully"

# Remove temporary tag
docker rmi "$KOKORO_TEMP_TAG" 2>/dev/null && echo "✓ Temporary Kokoro tag removed" || true

# Optionally remove backup tag if new build succeeded
if [ -n "$KOKORO_BACKUP_TAG" ]; then
    echo "Removing old Kokoro backup tag: $KOKORO_BACKUP_TAG"
    docker rmi "$KOKORO_BACKUP_TAG" 2>/dev/null && echo "✓ Old Kokoro backup tag removed" || true
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
