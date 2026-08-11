# Agentspine DOX

This repository uses DOX: a hierarchy of `AGENTS.md` files that agents must read
before editing and keep current after meaningful changes.

## Purpose

This repo is the Agentspine fork of Agent Zero. It should stay understandable as
both:

- an A0-compatible application tree, and
- an Agentspine product tree with durable overlay plugins, release variants, and
  updater-safe custom behavior.

## Ownership

- Upstream-compatible application code lives in the normal Agent Zero source
  tree.
- Agentspine-specific behavior should live in plugins or extension points when
  practical.
- Runtime/user state under `usr/` is not the same thing as built-in plugin
  source under `plugins/`.
- Generated runtime artifacts, bytecode caches, logs, local backups, and
  container snapshots are not source contracts.
- `DockerfileAgentSpine99` is the plugin-only Spine base pinned to the verified
  A0 v2.7 digest
  `sha256:a7f5ccf351d612c3eaafc708251490277e1d731afe71a2eaf8aa3d871a55ece4`,
  with `standard` and `cuda` targets. `docker/agentspine/compose.yml` selects
  the standard, Compose-paired Kokoro worker, or CUDA release variant; none of
  those files permit modification of host A0 files. A0 v2.8 compatibility is
  a separate custom-plugin validation target and must not rebase Spine 9.9.

## Local Contracts

- Read this file first, then read every child `AGENTS.md` on the path to files
  you will edit.
- The closest `AGENTS.md` controls local details; parent docs still control
  broader workflow and safety rules.
- Before changing behavior, identify whether the change belongs in core A0 code,
  a built-in plugin under `plugins/`, or runtime/user data under `usr/`.
- Keep Agentspine custom behavior updater-safe by preferring plugin packages and
  extension hooks over dirty core edits.
- Preserve A0 compatibility unless the task explicitly requires an Agentspine
  divergence.
- Update the nearest owning `AGENTS.md` when a change affects durable purpose,
  structure, contracts, workflows, permissions, side effects, or verification.

## Work Guidance

- Prefer focused edits over repo-wide refactors.
- Keep plugin code portable and self-describing through `plugin.yaml`, local
  docs, and scoped extension hooks.
- Do not delete or overwrite runtime/container state unless the user explicitly
  asks for that action.
- When comparing a live container with this repo, state which path is the source
  of truth for the change.
- Treat `_`-prefixed plugins as built-in overlays unless local docs say
  otherwise.

## Verification

- For Python plugin or helper changes, parse or compile the touched Python
  files.
- For WebUI extension changes, verify the affected browser/UI behavior when a
  live target is available.
- For Docker-backed Agentspine behavior, prefer route checks, logs, and
  container filesystem checks before concluding the UI is healthy.
- Keep local `.runtime/` validation state out of Docker build contexts; release
  images must be built from source and plugin packages, never copied runtime
  artifacts.
- Package the 9.9 release from the same pinned A0 v2.7 digest through
  `docker/agentspine/compose.yml`; its standard and CUDA targets must overlay
  identical verified built-in plugin packages. Do not alter A0 runtime source
  to accommodate an upstream base-image issue.
- The Spine 9.9 Docker overlays set the explicit Identity release gate
  (`AGENTSPINE_RELEASE=9.9` and `AGENTSPINE_IDENTITY_ENABLED=true`); do not
  carry those variables into A0/v2.7 custom-plugin deployments.
- Report any verification skipped and why.

## Child DOX Index

- `docker/AGENTS.md`: Compose build, worker sidecar, and release-variant
  contracts for Agent Spine 9.9.
- `plugins/AGENTS.md`: built-in and custom plugin source contracts, including
  the Agentspine overlay plugins.
