# Agent Spine v0.9.9 Compose Profiles

Agent Spine v0.9.9 publishes one application image:
`ghcr.io/omni-nexusai/agent-zero:v0.9.9-standard`.

Use the Compose file from the matching release source.

## Standard

```powershell
docker compose --profile standard pull
docker compose --profile standard up -d
```

## Standard with the Kokoro GPU worker

The app still pulls the published Standard image. Compose builds the local
worker sidecar and waits for its health endpoint before starting the app.

```powershell
docker compose --profile kokoro up -d --build
```

Select **Remote Kokoro worker / endpoint** in Enhanced Speech to use the
sidecar at `http://kokoro-worker:8891`.

## CUDA

CUDA is intentionally source-built so the published release remains one
Standard application image. Clone the matching `v0.9.9-gpu` tag on a
CUDA-capable host, then run:

```powershell
docker compose --profile cuda up -d --build
```

All profiles use the same built-in plugin packages. Enhanced Speech probes
runtime CUDA availability and host capabilities itself; it never infers support
from an image name.
