Development Build Tagging Workflow
=================================

This document outlines the manifest-and-tag system for producing reproducible Agent Zero development builds that retain the latest model picker, MCP toggle UX, and Kokoro settings enhancements, while preserving the "custom" build identifier (e.g. `Version D v0.9.7-custom <timestamp>`).

Manifest-driven validation
--------------------------

Each curated build updates `config/build_manifest.json` with:

- `version_id`: friendly label (e.g. `dev-D-0.9.7`)
- `commit_sha`: git hash for the validated state
- `timestamp`: optional ISO timestamp when tagging
- `display_version`: rendered banner string (e.g. `Version D v0.9.7-custom 2025-10-26 04:15:00`)
- `features[]`: list of critical feature descriptors; each entry enumerates required files and content markers.

Run `python scripts/validate_manifest.py` to assert required files exist and markers are present before creating a tag. Use `--skip-commit-check` while drafting, but restore the field before release.

## Creating Pre-Releases for Agent Systems

To make it easier for agent systems (Warp.dev, Gemini CLI, etc.) to pull validated versions, create pre-release tags:

1. Update manifest and create tag:
   ```bash
   python scripts/promote_dev_build.py --update-env
   git tag -a v0.9.7-custom -m "Pre-release: Development build with fastmcp enforcement"
   git push origin development v0.9.7-custom
   ```

2. Create GitHub pre-release (use the helper script):
   ```bash
   bash scripts/create_pre_release.sh v0.9.7-custom "Development build description"
   ```

3. Agents can now pull the pre-release easily:
   ```bash
   git clone -b v0.9.7-custom --depth 1 https://github.com/Omni-NexusAI/agent-zero.git
   ```

Pre-releases are easier for agent systems to discover and use than development branch commits.

Promotion workflow
------------------

1. `git checkout development && git pull`
2. Finish feature work and smoke-test locally
3. `python scripts/promote_dev_build.py --update-env` *(optionally pass `--version-id` to override the manifest label)*
4. Inspect the resulting banner (`A0_BUILD_VERSION`) and manifest updates
5. Tag if desired: `git tag -a dev-D-0.9.7-custom-<YYYYMMDDHHmm> -m "Dev build with latest UX"`
6. `git push origin development dev-D-0.9.7-custom-<timestamp>`
7. Optionally realign `latest-dev`: `git tag -f latest-dev HEAD && git push origin latest-dev --force`

The promote script automatically refreshes manifest metadata, validates required features, and syncs the friendly banner into `.env`.

Fresh environment bootstrap
---------------------------

### Standard Process (Recommended)

**For creating a fresh A0-dev container, use the `development` branch:**

```bash
# Clone the development branch from Omni-NexusAI repository
git clone -b development https://github.com/Omni-NexusAI/agent-zero.git <target-directory>
cd <target-directory>

# Verify critical dependencies
grep "fastmcp==" requirements.txt  # Must show: fastmcp==2.3.0

# Build container with no cache to ensure dependencies install correctly
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d

# Validate the build
python scripts/validate_manifest.py
```

### GPU acceleration for Kokoro & Whisper

- Dev images now install CUDA-enabled PyTorch by default. Pass `--build-arg PYTORCH_VARIANT=cpu` if you need a CPU-only build.
- To expose your local NVIDIA GPU when using Compose:
  ```bash
  docker compose \
    -f docker-compose-dev.yml \
    -f docker/compose.gpu.override.yml \
    up --build
  ```
  or set `COMPOSE_FILE=docker-compose-dev.yml:docker/compose.gpu.override.yml` before running `docker compose up`.
- Docker Desktop installations that support it can replace the `deploy.resources` block in the override with the shorthand `gpus: all`.

**Important**: The `development` branch always contains:
- `fastmcp==2.3.0` in `requirements.txt` (prevents Pydantic TypeError)
- Latest `mcp_server.py` with `create_streamable_http_app` compatibility
- All validated features (model picker, MCP toggles, Kokoro settings)

### Tagged Build Process (Alternative)

If you need a specific tagged build:

```
git clone https://github.com/Omni-NexusAI/agent-zero.git <target-directory>
cd <target-directory>
git fetch origin
git checkout tags/dev-D-0.9.7-custom-<timestamp>  # or latest-dev
python scripts/validate_manifest.py --skip-commit-check

# Still must rebuild container to install dependencies
docker compose -f docker/run/docker-compose.yml build --no-cache
docker compose -f docker/run/docker-compose.yml up -d
```

The validator confirms that the checkout contains required feature files/snippets before any manual UI verification.

Extending the manifest
----------------------

Add new feature entries as other UX improvements stabilize (e.g. Kokoro controls). Each entry should include reliable selectors or strings. For deeper assurance, extend `validate_manifest.py` to launch optional Playwright smoke tests referenced in the manifest.


