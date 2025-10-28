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

```
git fetch origin
git checkout tags/dev-D-0.9.7-custom-<timestamp>  # or latest-dev
python scripts/validate_manifest.py --skip-commit-check
```

The validator confirms that the checkout contains required feature files/snippets before any manual UI verification.

Extending the manifest
----------------------

Add new feature entries as other UX improvements stabilize (e.g. Kokoro controls). Each entry should include reliable selectors or strings. For deeper assurance, extend `validate_manifest.py` to launch optional Playwright smoke tests referenced in the manifest.


