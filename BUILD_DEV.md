# Building from Development Branch

This guide explains how to build and run the Agent Zero development build with the `omni-nexusai/agent-zero:dev` image tag.

## Quick Start

1. **Clone the repository** (or pull latest if already cloned):
   ```bash
   git clone -b development https://github.com/Omni-NexusAI/agent-zero.git
   cd agent-zero
   ```

2. **Build and run** using the dev compose file:
   ```bash
   docker-compose -f docker-compose-dev.yml up --build
   ```

3. **Access the UI** at `http://localhost:8891`

## What's Different in Dev Builds

- **Image name**: `omni-nexusai/agent-zero:dev` (instead of `agent0ai/agent-zero:latest`)
- **Container name**: `A0-dev`
- **Port**: `8891` (instead of `8888` or `50080`)
- **Version banner**: Displays custom build version from `A0_BUILD_VERSION` env var
- **Features**:
  - FastMCP 2.3.0 pinned (prevents Pydantic pedantic errors)
  - Streamable HTTP MCP app implementation
  - Dependency validation during build
  - Installer pulls from Omni-NexusAI fork for development branch

## Version Display

The build version is set via the `A0_BUILD_VERSION` environment variable in `docker-compose-dev.yml`:
```yaml
environment:
  - A0_BUILD_VERSION=Version D v0.9.7-custom 2025-11-04 13:59:00
```

This version string will appear in the web UI and logs instead of the git commit info.

## Troubleshooting

If you encounter **FastMCP pedantic errors** on other machines:
1. Ensure you're pulling from the `development` branch
2. Verify `fastmcp==2.3.0` in `requirements.txt`
3. Check that `validate_dependencies.sh` runs during build (look for "Validating critical dependencies..." in build logs)
4. Confirm the version banner shows your custom version string in the UI

## Reverting to Upstream

To switch back to the official build:
```bash
docker-compose -f docker/run/docker-compose.yml up
```
