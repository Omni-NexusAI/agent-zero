# Docker DOX

## Purpose

`docker/` contains container build and Compose delivery definitions for the
updater-safe Agentspine release variants.

## Local Contracts

- Read the child `AGENTS.md` before changing an Agentspine Compose profile or
  worker image.
- Keep application behavior in plugin packages. Container files may install
  runtime dependencies and wire services, but must not copy host A0 overlays or
  whole runtime state into an image.
- Preserve existing validation containers, images, and volumes unless the user
  explicitly authorizes their removal.
- CUDA target packages must be installed into `/opt/venv-a0`, the interpreter
  used by the running A0 application; do not rely on the build-image pyenv
  shims as proof of runtime GPU support.
- The A0 image refreshes `/a0` from `/git/agent-zero` at startup. Spine's
  built-in plugin packages therefore belong in `/git/agent-zero/plugins` in
  release images, never in `usr/plugins` or only in the transient `/a0` layer.
- Spine-only packages, including `_agentspine_identity` and
  `_multi_source_updater`, must be copied through the shared plugin-source
  stage so standard and CUDA receive identical built-ins while A0 deployments
  receive neither package.
- Shared, CPU/GPU-neutral speech runtime assets belong in the common Spine
  parent stage. In particular, the pinned Kokoro English pronunciation model
  must be present before either target starts so first playback never relies
  on a hidden runtime download.
- Spine 9.9 must remain pinned to A0 v2.7 image digest
  `sha256:a7f5ccf351d612c3eaafc708251490277e1d731afe71a2eaf8aa3d871a55ece4`.
  A0 v2.8 is a separate custom-plugin compatibility target, never an implicit
  Docker base refresh for Spine.

## Verification

- Render every changed Compose profile before building it.
- Confirm its container name, port, volume ownership, dependency health check,
  and GPU request match the documented release contract.
