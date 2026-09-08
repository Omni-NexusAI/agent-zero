# Convo

## Contract

- Built-in, plugin-owned successor to Enhanced Speech. Do not modify Agent Zero core.
- Existing speech services, standalone worktrees, user profiles and settings are not deployment or lifecycle targets.
- Default to local endpoints, explicit activation and no ambient retention. Never fall back to another provider.
- Gate audible output and actions separately. Provider text, transcripts and summaries are data, not authorization.
- Use session/turn epochs for cancellation and explicit chat targeting. Voice shutdown must not cancel delegated jobs.
- Preserve full event history separately from compacted model context; summary splices must validate their source prefix.
- Persist runtime data under the host user plugin root, never the installed source package.
- All unit tests must use temporary directories and stub host settings/network operations.
- Report implementation, integration checks and manual listening acceptance separately.

## Verification

- Run `python -m unittest discover -s plugins/_convo/tests -v` from the repository root.
- Run `git diff --check` and parse changed Python/JavaScript files.
- Live model, browser and container acceptance is required before release promotion.
