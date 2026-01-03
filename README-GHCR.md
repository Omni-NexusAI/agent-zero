# Building and Pushing to GitHub Container Registry (GHCR)

This guide explains how to build and push pre-built Docker images to GitHub Container Registry for all three build variants.

## Prerequisites

1. **Docker** installed and running
2. **GitHub Personal Access Token (PAT)** with `write:packages` permission
3. **Repository access** to `Omni-NexusAI/agent-zero`

## Authentication

Login to GitHub Container Registry:

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

Or interactively:
```bash
docker login ghcr.io
```

## Building and Pushing Images

Use the provided script to build and push all variants:

```bash
chmod +x scripts/build_and_push_ghcr.sh
./scripts/build_and_push_ghcr.sh v0.9.8-custom-pre
```

The script will build and push:
- **CPU-only**: `ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu`
- **Full GPU**: `ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-fullgpu`
- **Hybrid GPU**: `ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu`
- **Kokoro Worker**: `ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom-pre`

## Pulling and Running Pre-built Images

### CPU-only Build

```bash
docker-compose -f docker-compose-ghcr-cpu.yml pull
docker-compose -f docker-compose-ghcr-cpu.yml up -d
```

Access at: `http://localhost:8891`

### Full GPU Build

```bash
docker-compose -f docker-compose-ghcr-fullgpu.yml pull
docker-compose -f docker-compose-ghcr-fullgpu.yml up -d
```

Access at: `http://localhost:8892`

**Note**: Requires NVIDIA GPU and nvidia-docker runtime.

### Hybrid GPU Build

```bash
docker-compose -f docker-compose-ghcr-hybrid.yml pull
docker-compose -f docker-compose-ghcr-hybrid.yml up -d
```

Access at: `http://localhost:8893`

**Note**: Requires NVIDIA GPU and nvidia-docker runtime for the Kokoro worker.

## Manual Build (Alternative)

If you prefer to build manually:

### CPU-only

```bash
docker build \
  --build-arg GIT_REF=v0.9.8-custom-pre \
  --build-arg BUILD_VARIANT="" \
  -t ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu \
  -f docker/run/Dockerfile \
  docker/run

docker push ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu
```

### Full GPU

```bash
docker build \
  --build-arg GIT_REF=v0.9.8-custom-pre \
  --build-arg BUILD_VARIANT=fullGPU \
  --build-arg PYTORCH_VARIANT=cuda \
  -t ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-fullgpu \
  -f docker/run/Dockerfile \
  docker/run

docker push ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-fullgpu
```

### Hybrid GPU (Main Container)

```bash
docker build \
  --build-arg GIT_REF=v0.9.8-custom-pre \
  --build-arg BUILD_VARIANT=hybridGPU \
  -t ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu \
  -f docker/run/Dockerfile \
  docker/run

docker push ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu
```

### Kokoro GPU Worker

```bash
docker build \
  -t ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom-pre \
  -f docker/Dockerfile.kokoro \
  .

docker push ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom-pre
```

## Image Tags

Each variant uses the following tagging scheme:
- Specific version: `v0.9.8-custom-pre-{variant}`
- Latest: `v0.9.8-custom-pre-{variant}-latest`

Examples:
- `ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu`
- `ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-cpu-latest`

## Permissions

After pushing, you may need to make the package public or grant access:

1. Go to https://github.com/orgs/Omni-NexusAI/packages
2. Select the package
3. Go to "Package settings" → "Change visibility" or "Manage access"

## Troubleshooting

### Authentication Errors

If you get authentication errors:
1. Verify your GitHub PAT has `write:packages` permission
2. Try logging in again: `docker login ghcr.io`
3. Check that your username is correct (case-sensitive)

### Build Failures

If builds fail:
1. Ensure you're on the correct branch/tag
2. Check that all dependencies are available
3. Review Docker build logs for specific errors

### Pull Errors

If pulling fails:
1. Verify the image exists: https://github.com/orgs/Omni-NexusAI/packages
2. Check image permissions (may need to be public or grant access)
3. Ensure you're authenticated: `docker login ghcr.io`

