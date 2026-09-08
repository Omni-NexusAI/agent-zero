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
- General Convo settings saves must not write native provider settings; explicit native/legacy speech controls own those writes.
- Studio lifecycle commands target only the fixed authenticated `convo-audio` service. Never route lifecycle commands to an arbitrary configured external TTS endpoint.
- Model downloads require a reviewed source manifest and explicit approval. Verify immutable revision, file sizes/checksums and storage reserve before registration. Preserve partials and quarantine corrupt bytes outside registered models.
- Retain vendored runtime attribution and isolate Convo adaptations in the headless gateway. No standalone Gradio UI or weights belong in the package.
- User-visible transcripts and playback-start/completion records are distinct from model drafts. Delayed transcripts update the original turn/target.
- Keep incomplete capability paths explicit in README and the release gate; no speculative/omni/native-PCM performance claim without measurements.
- Native Kokoro must be already loaded with cached selected voices. Run synchronous synthesis off the WebSocket loop, keep one tracked worker, and withhold new TTS while a detached worker is still finishing.
- Native plugin OFF must release Convo sessions and owned Python patches, pause new job dispatch, retain histories/settings and observe already-submitted jobs. Track exact patch ownership; never overwrite another plugin's replacement.
- Use plugin-owned `tests/in-image.ps1` with existing images and bounded, empty test state. No rebuild, dependencies, user volumes, GPU or network for host-only tests. `-Reuse` reruns only a verified matching stopped test container.
- Reuse validation must retain command identity, read-only source mounts, private namespaces, no added capabilities/devices/ports, bounded scratch/resources/logs and explicit offline flags. Test the validator without contacting Docker via `tests/image-policy.test.ps1`.
- Keep independent Plugin Doctor available in development while Convo is OFF. A broken shared process can require an approved same-image process restart; do not default to image rollback.

## Ownership index

- `helpers/`: configuration, migration, host adapters, SQLite journal, policy, transport and utility compaction.
- `api/`: host-authenticated voice and control entrypoints; endpoints and credentials are server-owned.
- `webui/` and `extensions/`: native controls, sidebar, provider compatibility and explicit activation.
- `sidecar/`: authenticated model adapters and optional managed headless audio.cpp; see `sidecar/AGENTS.md`.
- `tests/`: temporary-storage, mocked-provider checks; no installed settings, models or services.

## Verification

- Run `python -m unittest discover -s plugins/_convo/tests -v` from the repository root.
- Run `git diff --check` and parse changed Python/JavaScript files.
- Run both `node --test plugins/_convo/tests/audio.test.mjs` and `node --experimental-vm-modules --test plugins/_convo/tests/ui.test.mjs`.
- Actual image smoke checks exercise native HTTP auth/CSRF and WebSocket admission, disabled-target diagnostics, inert OFF hooks, all speech-adapter restoration and byte-preserved native configuration. They never start the application server.
- Live model, browser and container acceptance is required before release promotion.
