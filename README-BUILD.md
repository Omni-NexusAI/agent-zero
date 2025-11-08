# Agent Zero Build System

## Overview

This build system is designed to be **fully automated** - just pull and build. All custom features are hardcoded into the build process.

## Quick Start

### Building from Pre-Release Tag (Recommended)

Pre-release tags contain all validated custom features and are tested.

```bash
# Build from pre-release tag v0.9.7-custom
docker compose -f docker-compose-prerelease.yml build --no-cache

# Run the container
docker compose -f docker-compose-prerelease.yml up -d
```

### Building from Development Branch

```bash
# Build from development branch (Omni-NexusAI fork)
docker compose -f docker-compose-development.yml build --no-cache

# Run the container
docker compose -f docker-compose-development.yml up -d
```

## How It Works

### Automatic Version Detection

1. **During Build**: The build process automatically:
   - Clones the repository from the correct source (Omni-NexusAI for tags/development)
   - Computes the build version from git tag/commit
   - Embeds the version into the image at `/a0_build_version.txt`
   - Validates and enforces `fastmcp==2.3.0`

2. **At Runtime**: The container automatically:
   - Reads the version from `/a0_build_version.txt`
   - Sets `A0_BUILD_VERSION` environment variable
   - Displays the correct version in the UI banner

### Supported GIT_REF Values

- **Tags**: `v0.9.7-custom` (from Omni-NexusAI) - Update tag name when creating new pre-releases
- **Branches**: `development` (from Omni-NexusAI), `main`, `testing` (from agent0ai)

### Custom Features Included

All custom features for 0.9.7 are automatically included when building from:
- Pre-release tags (e.g., `v0.9.7-custom`)
- Development branch (from Omni-NexusAI)

Features include:
- ✅ Model Picker UI
- ✅ MCP Toggle Panel
- ✅ Kokoro Extended Settings
- ✅ fastmcp 2.3.0 compatibility
- ✅ Automatic version banner

## Building Custom Tags

To build a different pre-release tag:

```bash
# Replace v0.9.7-custom with your desired pre-release tag
docker build -f docker/run/Dockerfile \
  --build-arg GIT_REF=v0.9.7-custom \
  --build-arg CACHE_DATE=$(date +%Y-%m-%d:%H:%M:%S) \
  -t agent-zero:v0.9.7-custom \
  ./docker/run
```

## Repository Selection

The build system automatically selects the correct repository:

- **Tags** (e.g., `v0.9.7-custom`): Always from `Omni-NexusAI/agent-zero`
- **Development branch**: From `Omni-NexusAI/agent-zero`
- **Other branches**: From `agent0ai/agent-zero`

## Version Banner Format

The version banner automatically displays:
- **From tag**: `Version D <tag>-custom <timestamp>`
- **From commit**: `Version D dev-<commit>-custom <timestamp>`

Example: `Version D 0.9.7-custom 2025-11-04 18:06:16`

## Troubleshooting

### Version shows "unknown"

If the version banner shows "unknown", check:
1. The container has `/a0_build_version.txt` file
2. The `A0_BUILD_VERSION` environment variable is set
3. The git repository was cloned correctly during build

### Missing Features

Ensure you're building from:
- A pre-release tag (e.g., `v0.9.7-custom`)
- The `development` branch from Omni-NexusAI

Features are automatically included in these builds.

### fastmcp Errors

The build automatically enforces `fastmcp==2.3.0`. If you see errors:
1. Check that `validate_dependencies.sh` ran during build
2. Verify `fastmcp==2.3.0` in the container: `docker exec <container> pip show fastmcp`

