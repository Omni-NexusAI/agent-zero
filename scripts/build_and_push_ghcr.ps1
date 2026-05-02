param(
    [string]$VERSION_TAG = "v0.9.9-standard-pre",
    [ValidateSet("standard","gpu")]
    [string]$BUILD_TYPE = "standard",
    [ValidateSet("pre","release")]
    [string]$RELEASE_CHANNEL = "pre",
    [switch]$Push
)

$ErrorActionPreference = "Stop"

$GHCR_REGISTRY = "ghcr.io"
$GHCR_USER = "omni-nexusai"
$IMAGE_NAME = "agent-zero"
$KOKORO_IMAGE_NAME = "agent-zero-kokoro-worker"
$CACHE_DATE = Get-Date -Format "yyyy-MM-dd:HH:mm:ss"

if ($BUILD_TYPE -eq "gpu") {
    $buildVariant = "fullGPU"
    $torchVariant = "cuda"
} else {
    $buildVariant = "standard"
    $torchVariant = "cpu"
}

Write-Host "Building Agentspine image" -ForegroundColor Cyan
Write-Host "Image tag: $VERSION_TAG"
Write-Host "Build type: $BUILD_TYPE"
Write-Host "Release channel: $RELEASE_CHANNEL"
Write-Host "Push: $Push"

docker info | Out-Null

docker build `
    --build-arg GIT_REF=$VERSION_TAG `
    --build-arg BUILD_VARIANT=$buildVariant `
    --build-arg RELEASE_CHANNEL=$RELEASE_CHANNEL `
    --build-arg PYTORCH_VARIANT=$torchVariant `
    --build-arg CACHE_DATE=$CACHE_DATE `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$VERSION_TAG" `
    -f docker/run/Dockerfile `
    docker/run

if ($BUILD_TYPE -eq "standard") {
    docker build `
        --build-arg CACHE_DATE=$CACHE_DATE `
        -t "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:$VERSION_TAG" `
        -f docker/Dockerfile.kokoro `
        .
}

if ($Push) {
    docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$VERSION_TAG"
    if ($BUILD_TYPE -eq "standard") {
        docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:$VERSION_TAG"
    }
}

Write-Host "Done." -ForegroundColor Green
