param(
    [string]$VERSION_TAG = "v0.9.9-standard-pre",
    [ValidateSet("standard","gpu","worker")]
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

docker info | Out-Null

if ($BUILD_TYPE -eq "gpu") {
    $standardTag = if ($env:STANDARD_IMAGE_TAG) {
        $env:STANDARD_IMAGE_TAG
    } else {
        $VERSION_TAG -replace "-gpu", "-standard"
    }
    $standardImage = if ($env:STANDARD_IMAGE) {
        $env:STANDARD_IMAGE
    } else {
        "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$standardTag"
    }

    Write-Host "Building GPU addon image from $standardImage" -ForegroundColor Cyan
    docker build `
        --build-arg STANDARD_IMAGE=$standardImage `
        --build-arg GIT_REF=$VERSION_TAG `
        --build-arg BUILD_VARIANT=fullGPU `
        --build-arg RELEASE_CHANNEL=$RELEASE_CHANNEL `
        --build-arg PYTORCH_VARIANT=cuda `
        -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$VERSION_TAG" `
        -f docker/run/Dockerfile.gpu-addon `
        .

    if ($Push) {
        docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$VERSION_TAG"
    }
} elseif ($BUILD_TYPE -eq "worker") {
    Write-Host "Building Kokoro worker image" -ForegroundColor Cyan
    docker build `
        --build-arg CACHE_DATE=$CACHE_DATE `
        -t "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:$VERSION_TAG" `
        -f docker/Dockerfile.kokoro `
        .

    if ($Push) {
        docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:$VERSION_TAG"
    }
} else {
    Write-Host "Building standard image" -ForegroundColor Cyan
    docker build `
        --build-arg BRANCH=$VERSION_TAG `
        --build-arg CACHE_DATE=$CACHE_DATE `
        -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$VERSION_TAG" `
        -f docker/run/Dockerfile `
        docker/run

    if ($Push) {
        docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:$VERSION_TAG"
    }
}

Write-Host "Done." -ForegroundColor Green
