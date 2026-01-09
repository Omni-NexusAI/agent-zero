# PowerShell script to build and push Hybrid GPU build variant to GitHub Container Registry
# Usage: .\scripts\build_and_push_ghcr_hybrid.ps1 [VERSION_TAG]
# Example: .\scripts\build_and_push_ghcr_hybrid.ps1 v0.9.8-custom-pre-hybrid-gpu

param(
    [string]$VERSION_TAG = "v0.9.8-custom-pre-hybrid-gpu"
)

$GHCR_REGISTRY = "ghcr.io"
$GHCR_USER = "omni-nexusai"
$IMAGE_NAME = "agent-zero"
$KOKORO_IMAGE_NAME = "agent-zero-kokoro-worker"

Write-Host "Building and pushing Hybrid GPU build to GHCR" -ForegroundColor Cyan
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

# Build Hybrid GPU variant (main container)
Write-Host "=== Building Hybrid GPU variant (main container) ===" -ForegroundColor Yellow
docker build `
    --build-arg GIT_REF=$VERSION_TAG `
    --build-arg BUILD_VARIANT=hybridGPU `
    --build-arg CACHE_DATE=$CACHE_DATE `
    --no-cache `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}" `
    -t "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-latest" `
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
    --no-cache `
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
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-latest"
docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}-latest"

Write-Host ""
Write-Host "=== Success! Hybrid GPU images pushed to GHCR ===" -ForegroundColor Green
Write-Host ""
Write-Host "Hybrid GPU:  $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
Write-Host "Kokoro:      $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
