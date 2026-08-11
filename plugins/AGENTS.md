# Plugins DOX

## Purpose

`plugins/` contains built-in Agent Zero and Agentspine plugin source packages.
Agents should use this folder to understand plugin boundaries before changing
runtime behavior.

## Ownership

- `plugin.yaml` is the package manifest and version contract.
- `README.md` explains the plugin's purpose, design, runtime function, extension
  points, and verification checklist.
- `extensions/` contains hook implementations loaded by the plugin framework.
- `helpers/` contains plugin-local backend helpers.
- `webui/` and `extensions/webui/` contain plugin-local browser/UI assets or
  patches.
- `usr/plugins/` is runtime/user plugin state and is not the same source layer.

## Local Contracts

- Read this file and the target plugin's `AGENTS.md` before editing a plugin
  package.
- Keep built-in overlay plugins underscore-prefixed.
- Do not move Agentspine-specific behavior into core files unless a plugin-only
  implementation is not practical.
- Keep hook code idempotent; extension hooks may run more than once across app
  startup, agent initialization, or browser reloads.
- Keep manifests, READMEs, and local DOX files aligned when behavior or
  structure changes.
- Do not commit `.pyc`, `__pycache__`, logs, local config secrets, or copied live
  runtime state.

## Work Guidance

- Prefer plugin-local helpers over cross-plugin imports unless the dependency is
  already a stable core API.
- Preserve unknown config keys when reading or writing plugin settings.
- For WebUI patches, scope DOM observers and mutations tightly to the target UI
  surface.
- Retain plugin `webui/thumbnail.svg` assets. When a compatible host only
  advertises raster thumbnails, use a plugin-local inventory adapter instead of
  modifying host plugin-discovery code.
- For monkey patches, store a guard flag on the patched module/store/object and
  avoid double wrapping.
- If a plugin is currently a marker or compatibility anchor, document that
  status rather than inventing behavior.

## Verification

- Parse or compile all touched Python files.
- Confirm no generated cache artifacts remain under changed plugin packages.
- Check manifest name/version/`always_enabled` state after packaging changes.
- For browser hooks, verify the target page still loads and the patch runs once.

## Child DOX Index

- `_browser_agent/AGENTS.md`: browser-agent model routing and browser API/helper
  surfaces.
- `_chat_branching/AGENTS.md`: chat branch creation and branch data safety.
- `_chat_compaction/AGENTS.md`: chat summarization/compaction API and helpers.
- `_discovery/AGENTS.md`: onboarding/discovery banner surfaces.
- `_email_integration/AGENTS.md`: email channel API, prompt, job-loop, and
  delivery hooks.
- `_agentspine_identity/AGENTS.md`: Agentspine branding, release-banner, and text
  rewrite overlay.
- `_error_retry/AGENTS.md`: bounded retry behavior for exceptions and monologue
  loops.
- `_infection_check/AGENTS.md`: response, reasoning, and tool safety checks.
- `_memory/AGENTS.md`: memory hooks for embedding changes and monologue start.
- `_model_config/AGENTS.md`: model-slot/provider configuration and model
  resolution hooks.
- `_plugin_installer/AGENTS.md`: plugin installation and rollback-safe staging.
- `_plugin_scan/AGENTS.md`: plugin inventory/discovery metadata.
- `_plugin_validator/AGENTS.md`: plugin manifest and structure validation.
- `_promptinclude/AGENTS.md`: system-prompt include expansion.
- `_telegram_integration/AGENTS.md`: Telegram channel API, prompt, job-loop, and
  delivery hooks.
- `_text_editor/AGENTS.md`: text editing tools, helpers, and prompt guidance.
- `_whatsapp_integration/AGENTS.md`: WhatsApp channel API, prompt, job-loop, and
  delivery hooks.
- `_enhanced_mcp_config/AGENTS.md`: MCP configuration overlay and future MCP
  source-of-truth contract.
- `_enhanced_speech/AGENTS.md`: remote Kokoro TTS detection and enhanced STT
  recorder overlay.
- `_multi_source_updater/AGENTS.md`: self-update source selection overlay.
- `_provider_profiles/AGENTS.md`: provider/model-slot profile preservation
  overlay.
