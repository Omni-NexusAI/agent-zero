# Convo sidecars

- `app.py` is the authenticated model-adapter boundary. Role endpoints come only
  from server settings; no redirects or provider fallback for inference.
- `studio.py` has a fixed private managed-audio destination and an operation
  allowlist. Sidecar/audio tokens remain in server environments.
- `audiocpp/` vendors the reconciled supervisor, profile library and pinned engine
  patch. Keep NOTICE/license material with it. Convo adaptations belong in its
  headless gateway and download manager, not the standalone source checkout.
- Gateway must not expose the standalone chat proxy or GPU-guard bypass routes.
  No engine process or model download starts on module import or app startup.
- Model/profile volumes are Convo-owned and external to images. Never mount an
  existing user's speech profile/model volume as part of automatic setup.
- Downloads are explicit, public-source, revision-pinned, checksum-verified and
  cancellable/resumable. Do not transmit service credentials to download hosts.
- Buffered WAV is the preview output contract. Native PCM and speculative/duplex
  paths remain disabled until actual combined-load/listening acceptance.
- Imports/tests may not start a subprocess, GPU workload, service or network
  transfer. Stub every external/storage boundary in unit tests.
