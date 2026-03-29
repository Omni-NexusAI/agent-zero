# Kokoro TTS Enhancements PR Guide (for Warp Agents)

This note explains exactly how to prepare, open, and annotate the Kokoro TTS enhancements PR so all changes land in one place.

PR target
- Base branch: feature/kokoro-tts-refactor
- Head branch: kokoro/tts-refactor-hotapply-style
- Title suggestion: "feat(tts): Kokoro hot-apply + GPU device selection + voice selector UI + toast notifications"

Summary of included changes
- Hot-apply TTS settings without restart:
  - Device policy change (auto/cpu/cuda:auto/cuda:{index}) triggers model reload with CUDA cache cleanup
  - Voice and speed changes apply instantly with success toasts
- Toast notifications (NotificationManager) for load/reload/voice/speed events; linked to right-side toast stack and bell counter
- Voice blending support via API (voice + voice2)
- Voice selector UI improvements:
  - Custom dropdown with styled tokens
  - Category acronym smaller, darker grey; region and gender bold white; name emphasized
  - Language labels changed from en-US/en-GB to American/British
- Invalid voices removed: af_star, am_santa, am_shimmer (keep af_nova)

Key files changed
- python/helpers/kokoro_tts.py (device reload, toasts)
- python/helpers/device_utils.py (new; device enumerate/resolve/log)
- python/helpers/settings.py (hot-apply; voice list; toasts)
- python/api/synthesize.py (pass voice/voice2; blending)
- webui/index.html (custom voice dropdown rendering)
- webui/css/settings.css (voice selector styles)

Commits to include on the PR (already in kokoro/tts-refactor-hotapply-style)
- Cherry-pick hot-apply: ddea945
- API blending params: ecee442
- Toast notifications + labels: 67f6265
- Voice category styling (initial + tweaks): a91c284, 0eaa46b
- Custom voice dropdown: [this branch commit adding webui/index.html custom selector]

Notes to reviewers (must be in PR description)
- Recommended runtime: GPU-enabled container for faster speech
  - Provide a compose override to enable GPU; see snippet below
  - Auto will select CUDA when available; otherwise uses CPU
- Documentation follow-up: update install docs to include a "GPU Recommended" note for speech features

Compose override example (drop-in file docker/compose.gpu.override.yml)
```yaml path=null start=null
services:
  app:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    # Compose v2 shortcut (alternative):
    # gpus: all
```

Usage
- With docker compose: set COMPOSE_FILE to include this override or name it docker-compose.gpu.yml and add it to COMPOSE_FILE chain.
- With docker run: add --gpus all

Verification checklist (include in PR description)
- [ ] Toasts show for: initial Kokoro load, device reload, voice change (incl. merged voices), speed change
- [ ] Voice blend produces audio when both voice and blend voice are set
- [ ] Voice selector styling: category small grey; region/gender bold white; name emphasized; labels use American/British
- [ ] Device options show CUDA entries when GPU exposed to container; Auto pins to GPU
- [ ] No regressions to Settings modal

GitHub MCP PR creation (guidance for agents)
- Ensure GitHub MCP server is configured with a token allowed to create PRs in Omni-NexusAI/agent-zero
- Create PR:
  - base: feature/kokoro-tts-refactor
  - head: kokoro/tts-refactor-hotapply-style
  - title/body: use content from this note (Summary + Notes to reviewers + Verification checklist)
- Add labels: area:tts, enhancement, ui, notifications
- Assign reviewer(s) as per project convention