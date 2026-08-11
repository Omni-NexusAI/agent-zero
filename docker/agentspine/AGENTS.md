# Agentspine Compose DOX

## Purpose

This directory owns the Agent Spine 9.9 Compose delivery surface and its
plugin-local Kokoro GPU worker.

## Local Contracts

- `compose.yml` has exactly three delivery profiles: `standard`, `kokoro`, and
  `cuda`, all based on the shared `DockerfileAgentSpine99` source pinned to the
  verified A0 v2.7 digest
  `sha256:a7f5ccf351d612c3eaafc708251490277e1d731afe71a2eaf8aa3d871a55ece4`.
  `standard` and the app in `kokoro` pull the sole published application image
  `ghcr.io/omni-nexusai/agent-zero:v0.9.9-standard`; the Kokoro sidecar and
  `cuda` target build locally from the matching source tag. Do not substitute
  A0 v2.8 here; it is validated separately as a custom plugin target.
- `standard` has one app service. `kokoro` must start the named app and
  `kokoro-worker` sidecar in one Compose stack; the app reaches it only at
  `http://kokoro-worker:8891` after the sidecar health check passes.
- A standard candidate can join the same Compose-owned sidecar by starting
  `standard` and `kokoro-worker` together with both profiles. The standard
  image receives the endpoint through environment configuration but uses it
  only when Enhanced Speech is set to Remote GPU worker. The sidecar retains
  legacy DNS aliases so an already-built standard app on the Compose network
  can attach without host-address routing or a rebuild.
- `cuda` is the same plugin package revision as `standard` and differs only in
  CUDA runtime support. It is a source-built profile, not a second GHCR
  application image. Never reintroduce the legacy GPU-pre parent.
- Keep heavyweight spaCy/CUDA dependency stages ahead of the late shared
  plugin-package stage. A plugin-only repair must rebuild both targets from
  the same source copy without re-downloading their runtime dependencies.
- The app services set `BUILD_VARIANT=standard` or `cuda`; Spine Identity uses
  that explicit runtime value to render its non-pre 9.9 target label, never an
  image-name heuristic.
- Keep named `/a0/usr` volumes independent and never bind a whole old `/a0`
  tree into a release candidate.
- The image entrypoint archives only the explicit legacy Spine custom source
  packages that contain `plugin.yaml` under
  `/a0/usr/agentspine-plugin-migration-backups/`, then leaves their config and
  toggle state in config-only user directories. This prevents restored custom
  source from shadowing identical built-ins without touching unrelated user
  plugins. It translates both legacy `.enabled`/`.disabled` markers and the
  current A0 `.toggle-1`/`.toggle-0` markers to current config-only state.
- The worker speaks only the Enhanced Speech remote protocol. Its health and
  synthesis paths must truthfully report CUDA availability and never silently
  fall back to CPU when CUDA was selected.

## Verification

- Render all profiles, parse worker Python, and compare plugin package hashes
  between standard and CUDA after successful builds.
- Validate service discovery, GPU activity, cold/warm timing, and the app's
  dual-voice `voice`, `voice2`, `blend`, and `speed` request contract before
  release promotion.
