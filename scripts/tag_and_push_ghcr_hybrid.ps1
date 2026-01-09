# PowerShell script to tag and push existing Hybrid GPU build images to GitHub Container Registry
# Usage: .\scripts\tag_and_push_ghcr_hybrid.ps1 [VERSION_TAG] [LOCAL_HYBRID_IMAGE] [LOCAL_KOKORO_IMAGE]
# Example: .\scripts\tag_and_push_ghcr_hybrid.ps1 v0.9.8-custom-pre-hybrid-gpu

param(
    [string]$VERSION_TAG = "v0.9.8-custom-pre-hybrid-gpu",
    [string]$LOCAL_HYBRID_IMAGE = "a0-hybrid-custom-a0-hybrid:latest",
    [string]$LOCAL_KOKORO_IMAGE = "a0-hybrid-custom-kokoro-gpu-worker:latest"
)

$GHCR_REGISTRY = "ghcr.io"
$GHCR_USER = "omni-nexusai"
$IMAGE_NAME = "agent-zero"
$KOKORO_IMAGE_NAME = "agent-zero-kokoro-worker"

Write-Host "Tagging and pushing existing Hybrid GPU build to GHCR" -ForegroundColor Cyan
Write-Host "Version tag: $VERSION_TAG"
Write-Host "Local hybrid image: $LOCAL_HYBRID_IMAGE"
Write-Host "Local Kokoro image: $LOCAL_KOKORO_IMAGE"
Write-Host "Registry: $GHCR_REGISTRY/$GHCR_USER"
Write-Host ""

# Check Docker is running
try {
    docker info | Out-Null
} catch {
    Write-Host "Error: Docker is not running or not accessible" -ForegroundColor Red
    exit 1
}

# Check if local images exist
Write-Host "=== Checking local images ===" -ForegroundColor Yellow
$hybridExists = docker images -q $LOCAL_HYBRID_IMAGE 2>&1
if (-not $hybridExists -or $hybridExists -match "Error") {
    Write-Host "Error: Local hybrid image '$LOCAL_HYBRID_IMAGE' not found" -ForegroundColor Red
    Write-Host "Available hybrid images:" -ForegroundColor Yellow
    docker images | Select-String "hybrid" | Select-Object -First 5
    exit 1
}

$kokoroExists = docker images -q $LOCAL_KOKORO_IMAGE 2>&1
if (-not $kokoroExists -or $kokoroExists -match "Error") {
    Write-Host "Error: Local Kokoro image '$LOCAL_KOKORO_IMAGE' not found" -ForegroundColor Red
    Write-Host "Available Kokoro images:" -ForegroundColor Yellow
    docker images | Select-String "kokoro" | Select-Object -First 5
    exit 1
}

Write-Host "✓ Local hybrid image found: $LOCAL_HYBRID_IMAGE" -ForegroundColor Green
Write-Host "✓ Local Kokoro image found: $LOCAL_KOKORO_IMAGE" -ForegroundColor Green
Write-Host ""

# Tag Hybrid GPU main container
Write-Host "=== Tagging Hybrid GPU main container ===" -ForegroundColor Yellow
docker tag "$LOCAL_HYBRID_IMAGE" "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag hybrid image" -ForegroundColor Red
    exit 1
}

docker tag "$LOCAL_HYBRID_IMAGE" "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-latest"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag hybrid image (latest)" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Tagged: $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}" -ForegroundColor Green
Write-Host "✓ Tagged: $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-latest" -ForegroundColor Green
Write-Host ""

# Tag Kokoro GPU worker
Write-Host "=== Tagging Kokoro GPU worker ===" -ForegroundColor Yellow
docker tag "$LOCAL_KOKORO_IMAGE" "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag Kokoro worker image" -ForegroundColor Red
    exit 1
}

docker tag "$LOCAL_KOKORO_IMAGE" "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}-latest"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag Kokoro worker image (latest)" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Tagged: $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}" -ForegroundColor Green
Write-Host "✓ Tagged: $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}-latest" -ForegroundColor Green
Write-Host ""

# Push all images
Write-Host "=== Pushing images to GHCR ===" -ForegroundColor Yellow
Write-Host "This may take a while depending on your internet connection..." -ForegroundColor Cyan
Write-Host ""

docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to push hybrid image" -ForegroundColor Red
    exit 1
}

docker push "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}-latest"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to push hybrid image (latest)" -ForegroundColor Red
    exit 1
}

docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to push Kokoro worker image" -ForegroundColor Red
    exit 1
}

docker push "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}-latest"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to push Kokoro worker image (latest)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Success! Hybrid GPU images pushed to GHCR ===" -ForegroundColor Green
Write-Host ""
Write-Host "Hybrid GPU:  $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
Write-Host "Kokoro:      $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
Write-Host ""
Write-Host "You can now pull these images on other machines using:" -ForegroundColor Cyan
Write-Host "  docker pull $GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
Write-Host "  docker pull $GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
