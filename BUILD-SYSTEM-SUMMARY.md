# Build System Summary - Fully Automated Build Process

## Overview

The build system has been redesigned to be **fully automated** - no manual scripts needed. All custom features are hardcoded into the build process. Just pull and build.

## Key Changes

### 1. Automatic Version Detection
- **During Build**: Version is automatically computed from git tag/commit
- **At Runtime**: Version is automatically exported as `A0_BUILD_VERSION` environment variable
- **UI Display**: Version banner automatically shows correct version

### 2. Tag Support
- Build system now supports both **branches** and **tags**
- Tags automatically clone from `Omni-NexusAI/agent-zero` repository
- Pre-release tags (e.g., `v0.9.7-custom`) contain all validated custom features

### 3. Repository Selection
- **Tags**: Always from `Omni-NexusAI/agent-zero`
- **Development branch**: From `Omni-NexusAI/agent-zero`
- **Other branches**: From `agent0ai/agent-zero`

### 4. Automatic Dependency Validation
- `fastmcp==2.3.0` is automatically validated and enforced during build
- No manual intervention needed

## Files Changed

### Core Build Scripts
- `docker/run/Dockerfile`: Updated to accept `GIT_REF` (branch or tag), computes and embeds version
- `docker/run/fs/ins/install_A0.sh`: Updated to support tags, automatically selects correct repository
- `docker/run/fs/ins/compute_build_version.sh`: NEW - Computes version from git tag/commit
- `docker/run/fs/ins/install_A02.sh`: Updated to recompute version after reinstall
- `docker/run/fs/exe/initialize.sh`: Updated to export version at container startup
- `docker/run/fs/exe/run_A0.sh`: Updated to export version before starting UI

### Docker Compose Files
- `docker-compose-dev.yml`: NEW - Builds from pre-release tag `v0.9.7-custom`
- `docker-compose-development.yml`: NEW - Builds from development branch
- `docker-compose-prerelease.yml`: NEW - Template for building from pre-release tags

### Documentation
- `README-BUILD.md`: NEW - Comprehensive build documentation
- `BUILD-SYSTEM-SUMMARY.md`: This file

## Usage

### Building from Pre-Release Tag (Recommended)

```bash
# Build from pre-release tag
docker compose -f docker-compose-prerelease.yml build --no-cache

# Run container
docker compose -f docker-compose-prerelease.yml up -d
```

### Building from Development Branch

```bash
# Build from development branch
docker compose -f docker-compose-development.yml build --no-cache

# Run container
docker compose -f docker-compose-development.yml up -d
```

### Building Custom Tag

```bash
cd docker/run
# Replace v0.9.7-custom with your desired pre-release tag
docker build -t agent-zero:v0.9.7-custom \
  --build-arg GIT_REF=v0.9.7-custom \
  --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) .
```

## How Version Detection Works

1. **During Docker Build**:
   - Repository is cloned (tag or branch)
   - `compute_build_version.sh` extracts:
     - Git tag (if on a tag)
     - Git commit hash (if not on a tag)
     - Commit timestamp
   - Version string is formatted: `Version D <tag/commit>-custom <timestamp>`
   - Version is saved to `/a0_build_version.txt` in the image

2. **At Container Startup**:
   - `initialize.sh` reads `/a0_build_version.txt`
   - Sets `A0_BUILD_VERSION` environment variable
   - Adds to `/etc/environment` for all processes

3. **In UI**:
   - `run_ui.py` calls `build_info.get_display_version()`
   - Reads `A0_BUILD_VERSION` from environment
   - Falls back to git info if env var not set
   - Displays in UI banner

## Version Format

- **From tag**: `Version D 0.9.7-custom 2025-11-04 18:06:16`
- **From commit**: `Version D dev-abc1234-custom 2025-11-04 18:06:16`

## Custom Features Included

All custom features for 0.9.7 are automatically included when building from:
- Pre-release tags (e.g., `v0.9.7-custom`)
- Development branch (from Omni-NexusAI)

Features include:
- ✅ Model Picker UI
- ✅ MCP Toggle Panel
- ✅ Kokoro Extended Settings
- ✅ fastmcp 2.3.0 compatibility
- ✅ Automatic version banner

## Testing

To test the build system:

1. Build from pre-release tag:
   ```bash
   docker compose -f docker-compose-prerelease.yml build --no-cache
   ```

2. Start container:
   ```bash
   docker compose -f docker-compose-prerelease.yml up -d
   ```

3. Verify version:
   ```bash
   docker exec <container> cat /a0_build_version.txt
   docker exec <container> env | grep A0_BUILD_VERSION
   ```

4. Check UI:
   - Open browser to container port
   - Verify version banner shows correct version (not "unknown")

## Troubleshooting

### Version shows "unknown"
- Check `/a0_build_version.txt` exists in container
- Check `A0_BUILD_VERSION` environment variable is set
- Verify git repository was cloned correctly during build

### Missing Features
- Ensure building from pre-release tag or development branch
- Features are automatically included in these builds

### fastmcp Errors
- Build automatically enforces `fastmcp==2.3.0`
- Check build logs for validation messages

## Migration Notes

### For Agents
- Use `GIT_REF` instead of `BRANCH` in build commands
- Pre-release tags are recommended for stable builds
- Development branch contains latest custom features

### For Developers
- Version is automatically computed - no manual updates needed
- New pre-release tags automatically get correct version
- Custom features are automatically included in development builds

