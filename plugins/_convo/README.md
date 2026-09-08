# Convo

Convo adds a local-first voice conversation alongside Agent Zero's text chat. It is a built-in successor to Enhanced Speech, retaining native dictation while connecting a conversational model to background agent work.

**Development status:** implementation in progress. Not deployed or certified for live use. Existing speech services and the standalone pipeline remain unchanged.

## Implemented source checkpoint

- Capability-based configuration, authenticated host WebSocket and authenticated model sidecar. No browser-selected service URLs, provider fallback or bundled weights.
- Separate conversation/classifier/TTS roles, direct WAV input and Whisper text compatibility; buffered speech from an explicit compatible API, response-scoped native Kokoro on newer hosts, or managed audio.cpp Base cloning.
- Application-level speech/action gates, silence on uncertainty, one clarification per ambiguity episode with a 60-second cooldown, cancellation epochs and bounded input/output queues. No speculative model concurrency is enabled.
- SQLite event journal, full visible history, heard-versus-generated speech, delayed transcript reconciliation, explicit chat retargeting, and immutable-prefix background compaction through the host utility model.
- Persistent background jobs with submit/inspect/cancel/explicit-steer semantics, busy-target queueing, uncertain-outcome recovery and target-linked completion notices. Voice shutdown leaves jobs intact.
- Native composer orb, click/hold dictation, accessible dictation control, focused-app shortcut, sidebar extension and fallback panel.
- Cached voice-persona extraction at session start/retarget, constrained style overlay, bounded direct web search and already-loaded scoped memory retrieval.
- Headless audio.cpp packaging with a private authenticated control surface, persistent models/profiles and explicit load/unload. Native Studio provides clone creation, preview, tuning interchange and download inspection/approval/progress/pause/resume for two Base presets.
- Reversible, idempotent legacy JSON migration; old built-in import paths remain compatibility shims. Native voice/blending settings remain authoritative and general Convo saves do not overwrite them.

These are implemented code paths, **not a certification that they work together on either deployed host**. See [ACCEPTANCE.md](ACCEPTANCE.md) for outstanding release gates.

## Development setup (not performed automatically)

1. Review the plugin and legacy shims together on an isolated host built from this branch. Do not overlay the shims without `_convo`. Keep existing host/plugin config and toggle backups. Use the migration preview before applying; rollback refuses to overwrite newer edits.
2. Select the existing host Docker network through `CONVO_HOST_NETWORK`. Configure a fresh `CONVO_SIDECAR_TOKEN` in both the host and Convo runtime environments. Credentials are environment references, not browser settings values.
3. Review `sidecar/compose.yaml` before any deployment. Its default service is the model adapter on private port 8090; the separate `managed-audio` profile adds Convo-owned audio.cpp with fresh `convo-models` and `convo-voices` volumes. That profile requires a separate fresh `CONVO_AUDIO_TOKEN`, shared by runtime and audio service. No existing speech volume or service is mounted or managed. Starting the supervisor does not load models.
4. For managed audio, set the appropriate CUDA architecture at build time. Use native Studio to inspect the source/revision/license/size, approve a download, explicitly load a model, and create a clone profile from an authorized reference WAV plus exact transcript. Downloads verify every file before directory registration; cancellation preserves partials and failed checksums are quarantined. Storage reserve is enforced. No automatic re-download or overwrite of an installed model.
5. Configure explicit conversation and classifier URLs/model IDs. Audio input does **not** imply incremental input or duplex. Prefer an audio-capable classifier for local ambient mode; text-only compatibility is available in active mode through native Whisper. Whisper itself must be prepared through the host's controls. Remote ambient processing requires its own opt-in.
6. Choose `managed_audio` and the exact loaded model/clone IDs, or an explicit external speech endpoint/voice, or supported local native Kokoro. Preview native Kokoro voices first so both pipeline and embeddings are already cached; Convo refuses to load/download them implicitly. Managed Base capabilities are fixed to the adapter contract; unsupported instruction/voice-design controls are not inferred from family names. The [Qwen variant table](https://github.com/QwenLM/Qwen3-TTS#released-models-description-and-download) distinguishes Base cloning from other variants.
7. Enable the plugin and its composer control, then select a chat before starting. The microphone is acquired only after the authenticated sidecar handshake and persona setup. Click toggles Convo; holding for 450 ms enters native dictation. Changing the selected text chat alone does not silently retarget voice—use **Use selected chat**.

Model selection applies at the next session. Speech configuration is frozen per response; managed audio additionally freezes clone material, content revision/hash, engine epoch and supervisor instance. Native Kokoro freezes its response config. Generic external APIs must provide their own stable voice-selection semantics; mutable external clone-profile freezing is not yet certified.

Runtime data lives under `usr/plugins/_convo/data`; model/profile data lives in the separate managed volumes. Disabling Convo or stopping voice does not delete either or cancel background work. Existing source checkouts, FasterQwen, Groxaxo and external model servers remain untouched.

## Verification

From the host repository root:

```sh
python -m unittest discover -s plugins/_convo/tests -v
node --test plugins/_convo/tests/audio.test.mjs
node --experimental-vm-modules --test plugins/_convo/tests/ui.test.mjs
```

The current source checkpoint passes **47 Python and 8 JavaScript tests** with isolated settings/storage, mocked network/model responses, and no model processes. This includes a 200-turn journal/compaction simulation, retarget races, cancellation/detachment without overlapping native TTS, partial downloads, checksum failures, native-setting preservation and real headless gateway route/auth checks. It does not measure first-audible latency, acoustic judgment or GPU capacity. The reused supervisor currently emits FastAPI lifecycle deprecation warnings; its wrapper owns startup/shutdown explicitly.

## Still incomplete / not release-ready

- Both installed host integrations, image builds, real browser/microphone paths, disable/re-enable cutover, updater compatibility and full rollback rehearsal.
- Adaptive coupled-echo protection from standalone, measured semantic endpointing, classifier selection/quality corpus, classifier/main-model combined scheduling and performance instrumentation. Current capture uses browser AEC plus a bounded energy VAD; current inference classifies before answering and does not run speculative drafts.
- Native camera-context adapter, mid-session persona invalidation, optional compaction-model override, incremental/duplex/omni adapter implementations and true native PCM playback. Their capabilities are reserved, not falsely advertised as implemented.
- Native Studio profile editing/deletion and full form-based tuning parity, conversation/classifier download presets, and live metadata/download verification. The current download catalog covers audio.cpp Base TTS only.
- Combined-load benchmarks, sustained playback, ambient privacy/network observation and user listening acceptance. Ambient mode must not be treated as unattended-ready.

Implementation is developed on a dedicated feature branch against Agent Spine development. This remains a draft PR: no merge, production deployment, model download or protected service lifecycle change is implied.
