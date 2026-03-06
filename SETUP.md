# Agent Zero Development Build Setup

This guide explains how to set up a fresh Agent Zero development environment that works reliably across all agent systems (Cursor, Warp.dev, Gemini CLI, etc.).

## Quick Start (Recommended)

### Option 1: Use Pre-Release (Easiest for Agent Systems)

⚠️ **CRITICAL**: Pre-release tags ONLY exist in `Omni-NexusAI/agent-zero` repository.  
**DO NOT** use `agent0ai/agent-zero` - tags don't exist there!

**Pull from the latest pre-release tag:**

```bash
# Clone the pre-release version from Omni-NexusAI repository
git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git agent-zero-dev
cd agent-zero-dev

# Build container with no cache to ensure dependencies install correctly
docker compose -f docker/run/docker-compose.yml build --no-cache

# Start the container
docker compose -f docker/run/docker-compose.yml up -d

# Verify the build
docker compose -f docker/run/docker-compose.yml exec a0-dev pip show fastmcp
# Should show: Version: 2.3.0
```

**Or checkout from existing clone:**

```bash
# Make sure you're cloning from Omni-NexusAI, not agent0ai!
git remote set-url origin https://github.com/Omni-NexusAI/agent-zero.git
git fetch origin --tags
git checkout v0.9.7-custom
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d
```

### Option 2: Use Development Branch

**For creating a fresh A0-dev container from the development branch:**

```bash
# Clone the development branch from Omni-NexusAI repository
git clone -b development https://github.com/Omni-NexusAI/agent-zero.git agent-zero-dev
cd agent-zero-dev

# Build container with no cache to ensure dependencies install correctly
docker compose -f docker/run/docker-compose.yml build --no-cache

# Start the container
docker compose -f docker/run/docker-compose.yml up -d

# Verify the build
docker compose -f docker/run/docker-compose.yml exec a0-dev pip show fastmcp
# Should show: Version: 2.3.0
```

## Critical Requirements

### fastmcp Version
- **Required Version**: `fastmcp==2.3.0` (exactly this version)
- **Why**: Versions 2.3.4+ have a Pydantic compatibility bug causing `TypeError: cannot specify both default and default_factory`
- **Auto-Fix**: The build process automatically validates and fixes `fastmcp==2.3.0` in `requirements.txt` if it's wrong
- **Verification**: The install script verifies the correct version after installation

### Repository and Version
- **Repository**: `Omni-NexusAI/agent-zero` (GitHub)
- **Pre-Release Tag**: `v0.9.7-custom` (recommended for agent systems)
- **Development Branch**: `development` (for latest code)
- **Why**: Pre-releases contain validated features and correct dependency versions

## What Happens During Build

The Docker build process includes automatic dependency validation:

1. **Repository Clone**: Clones the `development` branch or pre-release tag to `/git/agent-zero`
2. **Dependency Validation**: Runs `validate_dependencies.sh` which:
   - Checks `requirements.txt` for `fastmcp==2.3.0`
   - Automatically fixes it if wrong version is detected
3. **Package Installation**: Installs all packages from `requirements.txt`
4. **Safety Check**: Explicitly reinstalls `fastmcp==2.3.0` to override any cached/wrong versions
5. **Verification**: Confirms `fastmcp==2.3.0` is actually installed before proceeding

## Troubleshooting

### fastmcp TypeError on Startup

**Symptom**: Container starts but stalls with high CPU, UI not accessible, errors about `TypeError: cannot specify both default and default_factory`

**Cause**: Wrong `fastmcp` version installed (usually 2.3.4 or newer)

**Fix**:
```bash
# Stop the container
docker compose -f docker/run/docker-compose.yml down

# Rebuild with no cache (this will re-run validation)
docker compose -f docker/run/docker-compose.yml build --no-cache

# Start again
docker compose -f docker/run/docker-compose.yml up -d

# Verify inside container
docker compose -f docker/run/docker-compose.yml exec a0-dev pip show fastmcp
# Should show: Version: 2.3.0
```

### Container Won't Start

**Check logs first**:
```bash
docker compose -f docker/run/docker-compose.yml logs a0-dev
```

**Common causes**:
- Wrong fastmcp version → Rebuild with `--no-cache`
- Port conflict → Check if port 80/50080 is already in use
- Missing dependencies → Rebuild with `--no-cache`

### Missing Features

**Ensure you're on the correct version**:
```bash
git describe --tags  # Should show: v0.9.7-custom (or latest pre-release)
# OR
git branch  # Should show: * development
git remote -v  # Should show: Omni-NexusAI/agent-zero
```

If not, clone fresh:
```bash
# For pre-release
git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git

# OR for development branch
git clone -b development https://github.com/Omni-NexusAI/agent-zero.git
```

## Manual Validation

After building, you can manually validate the build:

```bash
# Check fastmcp version
docker compose -f docker/run/docker-compose.yml exec a0-dev pip show fastmcp

# Run manifest validation (if you have the repo locally)
python scripts/validate_manifest.py

# Check container is running
docker compose -f docker/run/docker-compose.yml ps
```

## For Agent Systems

If you're an AI agent setting up this environment:

### ⚠️ CRITICAL: Repository Choice

**Pre-release tags ONLY exist in `Omni-NexusAI/agent-zero` repository.**  
**DO NOT use `agent0ai/agent-zero`** - tags don't exist there!

### Recommended Approach (Pre-Release):

```bash
# MUST use Omni-NexusAI repository for tags
git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git agent-zero-dev
cd agent-zero-dev
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d
```

### Alternative (Development Branch):

```bash
# MUST use Omni-NexusAI repository
git clone -b development https://github.com/Omni-NexusAI/agent-zero.git agent-zero-dev
cd agent-zero-dev
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d
```

**Key Points**:
1. **ALWAYS use** `Omni-NexusAI/agent-zero` repository (NOT `agent0ai/agent-zero`)
2. **Pre-release tags** (like `v0.9.7-custom`) ONLY exist in Omni-NexusAI repository
3. **Development branch** is `development` (NOT `dev` or `main`)
4. **Always rebuild** with `--no-cache` to ensure dependencies are fresh
5. **Verify fastmcp** version after build: `pip show fastmcp` should show `2.3.0`
6. **Check logs** if startup fails: `docker compose logs a0-dev`

The build system automatically handles dependency validation, but you must use the correct repository and version.

## Advanced: Custom Builds

If you need to build from a different branch or modify dependencies:

1. Clone the repository
2. Modify `requirements.txt` if needed
3. The validation script will auto-fix `fastmcp==2.3.0` if detected
4. Build as normal: `docker compose -f docker/run/docker-compose.yml build --no-cache`

**Note**: Manual changes to `fastmcp` version will be automatically corrected during build to prevent compatibility issues.

## Finding the Latest Pre-Release

Check GitHub releases for the latest pre-release:
- Visit: https://github.com/Omni-NexusAI/agent-zero/releases
- Look for tags marked as "Pre-release"
- Use the tag name (e.g., `v0.9.7-custom`) to clone: `git clone -b v0.9.7-custom --depth 1 ...`
