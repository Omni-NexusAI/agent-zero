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

# Backup existing tags to prevent tag loss if build is interrupted
$MAIN_TAG = "$GHCR_REGISTRY/$GHCR_USER/$IMAGE_NAME`:${VERSION_TAG}"
$TEMP_TAG = "$MAIN_TAG-temp-$(Get-Date -Format 'yyyyMMddHHmmss')"
$BACKUP_TAG = "$MAIN_TAG-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Check if main tag exists and backup it if needed
$existingImage = docker images -q "$MAIN_TAG" 2>&1
if ($existingImage -and $LASTEXITCODE -eq 0) {
    Write-Host "Existing image found for tag: $MAIN_TAG" -ForegroundColor Yellow
    Write-Host "Creating backup tag to prevent tag loss during build..." -ForegroundColor Yellow
    docker tag "$MAIN_TAG" "$BACKUP_TAG" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Backup tag created: $BACKUP_TAG" -ForegroundColor Green
    }
}

# Build Hybrid GPU variant (main container) with temporary tag first
Write-Host "=== Building Hybrid GPU variant (main container) ===" -ForegroundColor Yellow
Write-Host "Building with temporary tag first: $TEMP_TAG" -ForegroundColor Cyan
docker build `
    --build-arg GIT_REF=$VERSION_TAG `
    --build-arg BUILD_VARIANT=hybridGPU `
    --build-arg CACHE_DATE=$CACHE_DATE `
    --no-cache `
    -t "$TEMP_TAG" `
    -f docker/run/Dockerfile `
    docker/run

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Hybrid GPU build failed" -ForegroundColor Red
    Write-Host "Temporary image tag preserved: $TEMP_TAG" -ForegroundColor Yellow
    exit 1
}

# Build succeeded - tag the new image with final tags
Write-Host "Build successful. Tagging with final tags..." -ForegroundColor Green
docker tag "$TEMP_TAG" "$MAIN_TAG" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag image with $MAIN_TAG" -ForegroundColor Red
    exit 1
}

docker tag "$TEMP_TAG" "$MAIN_TAG-latest" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag image with $MAIN_TAG-latest" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Images tagged successfully" -ForegroundColor Green

# Remove temporary tag (optional, keeps image list cleaner)
docker rmi "$TEMP_TAG" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Temporary tag removed" -ForegroundColor Green
}

# Optionally remove backup tag if new build succeeded
if ($BACKUP_TAG) {
    Write-Host "Removing old backup tag: $BACKUP_TAG" -ForegroundColor Cyan
    docker rmi "$BACKUP_TAG" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Old backup tag removed" -ForegroundColor Green
    }
}

# Build Kokoro GPU worker (same protection as main image)
$KOKORO_TAG = "$GHCR_REGISTRY/$GHCR_USER/$KOKORO_IMAGE_NAME`:${VERSION_TAG}"
$KOKORO_TEMP_TAG = "$KOKORO_TAG-temp-$(Get-Date -Format 'yyyyMMddHHmmss')"
$KOKORO_BACKUP_TAG = "$KOKORO_TAG-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Check if Kokoro tag exists and backup it if needed
$existingKokoro = docker images -q "$KOKORO_TAG" 2>&1
if ($existingKokoro -and $LASTEXITCODE -eq 0) {
    Write-Host "Existing Kokoro image found for tag: $KOKORO_TAG" -ForegroundColor Yellow
    Write-Host "Creating backup tag..." -ForegroundColor Yellow
    docker tag "$KOKORO_TAG" "$KOKORO_BACKUP_TAG" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Backup tag created: $KOKORO_BACKUP_TAG" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Building Kokoro GPU worker ===" -ForegroundColor Yellow
Write-Host "Building with temporary tag first: $KOKORO_TEMP_TAG" -ForegroundColor Cyan
docker build `
    --build-arg CACHE_DATE=$CACHE_DATE `
    --no-cache `
    -t "$KOKORO_TEMP_TAG" `
    -f docker/Dockerfile.kokoro `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Kokoro worker build failed" -ForegroundColor Red
    Write-Host "Temporary image tag preserved: $KOKORO_TEMP_TAG" -ForegroundColor Yellow
    exit 1
}

# Kokoro build succeeded - tag with final tags
Write-Host "Build successful. Tagging with final tags..." -ForegroundColor Green
docker tag "$KOKORO_TEMP_TAG" "$KOKORO_TAG" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag Kokoro image with $KOKORO_TAG" -ForegroundColor Red
    exit 1
}

docker tag "$KOKORO_TEMP_TAG" "$KOKORO_TAG-latest" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to tag Kokoro image with $KOKORO_TAG-latest" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Kokoro images tagged successfully" -ForegroundColor Green

# Remove temporary tag
docker rmi "$KOKORO_TEMP_TAG" 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Temporary Kokoro tag removed" -ForegroundColor Green
}

# Optionally remove backup tag if new build succeeded
if ($KOKORO_BACKUP_TAG) {
    Write-Host "Removing old Kokoro backup tag: $KOKORO_BACKUP_TAG" -ForegroundColor Cyan
    docker rmi "$KOKORO_BACKUP_TAG" 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Old Kokoro backup tag removed" -ForegroundColor Green
    }
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
