# AgentSpine v0.9.8-custom Release Draft

## Release title
`v0.9.8-custom`

## Release summary
This release brings AgentSpine to a stable v0.9.8-custom baseline by combining the original custom feature set with selected upstream v0.9.8 capabilities from agent0ai. It keeps the custom experience front and center (MCP settings, Kokoro TTS expansion, model picker system) while integrating key upstream UI/runtime improvements.

## Highlights

### AgentSpine custom differentiators (original features)
- MCP settings system for managing client/server integrations from the UI.
- Kokoro TTS feature expansion with richer speech configuration and worker-aware controls.
- Model picker system with custom provider/model handling flow.

### Improvements carried from v0.9.7-custom
- Expanded TTS settings and improved Kokoro behavior/configuration.
- Model picker improvements for smoother selection and better model/provider handling.
- Continued custom backend/settings integration that forms the base for v0.9.8-custom.

### Merged from upstream v0.9.8
- Skills system (`SKILL.md`) and related UX support.
- Web UI redesign updates (process groups, step detail rendering, welcome/scheduler polish).
- Git projects capabilities and related workflow support.
- WebSocket-based synchronization and stability improvements.
- Additional provider and integration updates included from the upstream line.

## Build types

### 1) Standard
Primary default build for most users. This replaces separate non-GPU variants in release messaging.

Optional addon:
- Standard + Kokoro worker addon (if you want a separate Kokoro GPU worker service).

### 2) Full GPU
GPU-oriented build for full acceleration workflows.

## Docker build instructions (from source)

### Windows (PowerShell helper)
```powershell
# Builds/pushes variants based on VERSION_TAG and channel
.\scripts\build_and_push_ghcr.ps1 -VERSION_TAG "v0.9.8-custom" -RELEASE_CHANNEL "release"
```

### Linux/macOS (shell helper)
```bash
./scripts/build_and_push_ghcr.sh v0.9.8-custom release
```

### Manual docker build examples
```bash
# Standard (non-full-gpu)
docker build \
  --build-arg GIT_REF=v0.9.8-custom \
  --build-arg BUILD_VARIANT=standard \
  --build-arg RELEASE_CHANNEL=release \
  -t ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-standard \
  -f docker/run/Dockerfile \
  docker/run

# Full GPU
docker build \
  --build-arg GIT_REF=v0.9.8-custom \
  --build-arg BUILD_VARIANT=fullGPU \
  --build-arg RELEASE_CHANNEL=release \
  -t ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-full-gpu \
  -f docker/run/Dockerfile \
  docker/run

# Optional Kokoro worker addon image
docker build \
  -t ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom \
  -f docker/Dockerfile.kokoro \
  .
```

## Docker run instructions (prebuilt images)

### Standard
```bash
docker compose -f docker-compose-ghcr-standard.yml up -d
```

### Standard + optional Kokoro worker addon
```bash
docker compose -f docker-compose-ghcr-standard.yml --profile worker up -d
```

### Full GPU
```bash
docker compose -f docker-compose-ghcr-fullgpu.yml up -d
```

## Notes
- Image namespace remains `ghcr.io/omni-nexusai/agent-zero` and `ghcr.io/omni-nexusai/agent-zero-kokoro-worker`.
- Standard is the consolidated non-full-gpu release type for this release line.
- Full GPU remains the dedicated accelerated build type.
