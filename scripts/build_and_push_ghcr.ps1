# PowerShell script to build and push all three build variants to GitHub Container Registry
# Usage: .\scripts\build_and_push_ghcr.ps1 [VERSION_TAG]
# Example: .\scripts\build_and_push_ghcr.ps1 v0.9.8-custom-pre-hybrid-gpu

param(
    [string]$VERSION_TAG = "v0.9.8-custom-pre-hybrid-gpu"
)

$GHCR_REGISTRY = "ghcr.io"
$GHCR_USER = "omni-nexusai"
$IMAGE_NAME = "agent-zero"
$KOKORO_IMAGE_NAME = "agent-zero-kokoro-worker"

Write-Host "Building and pushing Agent Zero images to GHCR" -ForegroundColor Cyan
Write-Host "Version tag: $VERSION_TAG"
Write-Host "Registry: $GHCR_REGISTRY/$GHCR_USER"
Write-Host ""

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "Error: Docker is not running or not accessible" -ForegroundColor Red
    exit 1
}

$CACHE_DATE = Get-Date -Format "yyyy-MM-dd:HH:mm:ss"

# Build CPU-only variant
Write-Host "=== Building CPU-only variant ===" -ForegroundColor Yellow
docker build `
    --build-arg GIT_REF=$VERSION_TAG `
    --build-arg BUILD_VARIANT="" `
    --build-arg CACHE_DATE=$CACHE_DATE `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-cpu" `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-cpu-latest" `
    -f docker/run/Dockerfile `
    docker/run

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: CPU-only build failed" -ForegroundColor Red
    exit 1
}

# Build Full GPU variant
Write-Host ""
Write-Host "=== Building Full GPU variant ===" -ForegroundColor Yellow
docker build `
    --build-arg GIT_REF=$VERSION_TAG `
    --build-arg BUILD_VARIANT=fullGPU `
    --build-arg CACHE_DATE=$CACHE_DATE `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-fullgpu" `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-fullgpu-latest" `
    -f docker/run/Dockerfile `
    docker/run

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Full GPU build failed" -ForegroundColor Red
    exit 1
}

# Build Hybrid GPU variant (main container)
Write-Host ""
Write-Host "=== Building Hybrid GPU variant (main container) ===" -ForegroundColor Yellow
docker build `
    --build-arg GIT_REF=$VERSION_TAG `
    --build-arg BUILD_VARIANT=hybridGPU `
    --build-arg CACHE_DATE=$CACHE_DATE `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-hybrid-gpu" `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-hybrid-gpu-latest" `
    -f docker/run/Dockerfile `
    docker/run

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Hybrid GPU build failed" -ForegroundColor Red
    exit 1
}

# Build Kokoro GPU worker
Write-Host ""
Write-Host "=== Building Kokoro GPU worker ===" -ForegroundColor Yellow
docker build `
    --build-arg CACHE_DATE=$CACHE_DATE `
    -t "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}" `
    -t "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}-latest" `
    -f docker/Dockerfile.kokoro `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Kokoro worker build failed" -ForegroundColor Red
    exit 1
}

# Push all images
Write-Host ""
Write-Host "=== Pushing images to GHCR ===" -ForegroundColor Yellow
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-cpu"
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-cpu-latest"
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-fullgpu"
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-fullgpu-latest"
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-hybrid-gpu"
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-hybrid-gpu-latest"
docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}-latest"

Write-Host ""
Write-Host "=== Success! All images pushed to GHCR ===" -ForegroundColor Green
Write-Host ""
Write-Host "CPU-only:    $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-cpu"
Write-Host "Full GPU:    $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-fullgpu"
Write-Host "Hybrid GPU:  $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-hybrid-gpu"
Write-Host "Kokoro:      $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
