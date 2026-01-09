# How to Check Docker Build Status

## Quick Status Checks

### 1. Check if Docker build is running
```powershell
# Check Docker processes
Get-Process | Where-Object {$_.ProcessName -like '*docker*'} | Select-Object ProcessName, Id, CPU

# Or in cmd/bash:
docker info
```

### 2. Check if images are being created
```powershell
# See all images (including ones being built)
docker images

# Filter for GHCR images
docker images | Select-String "ghcr.io/omni-nexusai"

# Or in cmd/bash:
docker images | grep ghcr.io/omni-nexusai
```

### 3. Monitor Docker disk usage (builds use disk space)
```powershell
docker system df
```

### 4. Check the PowerShell window
- If the script is running in a PowerShell window, check that window for build output
- Look for progress indicators like:
  - `#X [Y/Z] RUN ...` (build steps)
  - `Downloading...` (downloading packages)
  - `Installing...` (installing dependencies)

### 5. Check build logs (if using docker buildx)
```powershell
# List buildx builds
docker buildx ls

# Check build history
docker buildx du
```

## Understanding Build Progress

The build goes through these stages:
1. **Base image pull** - Downloads the base image (quick)
2. **Setup** - Creates Python virtual environment
3. **Clone repository** - Clones from GitHub tag
4. **Install dependencies** - Installs Python packages (LONGEST - can take 20-40 minutes)
5. **Build components** - Builds A0 components
6. **Final image creation** - Creates final Docker image
7. **Push to GHCR** - Uploads to GitHub Container Registry

## Expected Duration

- **Total time**: 30-60 minutes (depends on internet speed and system performance)
- **Longest stage**: Dependency installation (20-40 minutes)
- **Quick stages**: Base image, setup (2-5 minutes each)

## What to Look For

### Signs Build is Working:
- ✅ Docker processes running (`dockerd`, `docker-proxy`, etc.)
- ✅ Disk space increasing (`docker system df` shows increasing usage)
- ✅ Network activity (if you can monitor it)
- ✅ Console output showing build steps

### Signs Build Completed:
- ✅ Images appear in `docker images` with `ghcr.io/omni-nexusai/agent-zero` tags
- ✅ Script shows "Success! Hybrid GPU images pushed to GHCR"
- ✅ No errors in console output

### Signs Build Failed:
- ❌ Error messages in console
- ❌ Script exits with error code
- ❌ No images created after long wait
- ❌ Docker process stops unexpectedly

## If Build is Stuck

1. **Check if it's actually stuck or just slow**:
   - Dependency installation can appear "stuck" but is actually downloading
   - Check disk usage: `docker system df` (should be increasing)
   
2. **Check Docker logs**:
   ```powershell
   # Check Docker daemon logs (Windows)
   Get-Content "$env:ProgramData\Docker\config\daemon.json" -ErrorAction SilentlyContinue
   ```

3. **Check network connection**:
   - Build needs internet to download packages
   - Check if you can reach: docker.io, github.com, pypi.org

4. **Restart if needed**:
   - Press `Ctrl+C` in the PowerShell window running the script
   - Fix any issues
   - Run the script again

## Monitoring in Real-Time

If you want to monitor the build more closely, you can run the build command directly:

```powershell
cd C:\agent-zero-data\a0-test-clone

# Build main container (you'll see all output)
docker build `
    --build-arg GIT_REF=v0.9.8-custom-pre-hybrid-gpu `
    --build-arg BUILD_VARIANT=hybridGPU `
    --build-arg CACHE_DATE=$(Get-Date -Format "yyyy-MM-dd:HH:mm:ss") `
    --no-cache `
    -t ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu `
    -f docker/run/Dockerfile `
    docker/run
```

This will show all build output in real-time.
