# Provider Profiles

Agentspine built-in provider-profile overlay for Agent Zero-compatible model
configuration.

## Purpose

`_provider_profiles` preserves model settings per provider and per model slot so
switching providers does not lose the previous provider's model, API base,
context settings, vision flag, rate limits, or provider kwargs.

This plugin was not present in the active GPU-pre container at the time this
monorepo sync was performed. The source was recovered from the v0.9.9-pre target
tree and packaged here with a manifest so it can be tracked consistently with
the other Agentspine overlays.

## Runtime Design

- `plugin.yaml` marks the package as `always_enabled` and associates it with the
  model settings section.
- `extensions/webui/page-head/_10_provider_profiles.html` is the active runtime
  hook. It patches the `_model_config` page and the `modelConfig` Alpine store.
- Persistent state is saved through the standard `/plugins` API using
  `get_config` and `save_config` for plugin name `_provider_profiles`.
- User state belongs in `/a0/usr/plugins/_provider_profiles/config.json`.

## How It Functions

The page-head script loads stored profiles once, then hooks `_model_config`
contexts as they are installed. It captures all current model-slot settings,
applies local-provider defaults, wraps `loadSettings`, wraps `save`, and patches
`searchModelsDetailed` so local providers receive an API base during model
search.

Provider select elements are wired on focus, pointerdown, keydown, and change.
Before a provider switch, the script snapshots the outgoing provider settings.
After the switch, it stores the outgoing profile, restores the incoming provider
profile if one exists, or applies a sensible default for local providers.

Profiles are keyed as `<model slot>:<provider>`, for example
`chat_model:lm_studio`.

## Saved Fields

Each profile stores:

- `provider`
- `name`
- `api_base`
- `ctx_length`
- `ctx_history`
- `ctx_input`
- `vision`
- `max_embeds`
- `rl_requests`
- `rl_input`
- `rl_output`
- `kwargs`

Local-provider defaults:

- LM Studio: `http://host.docker.internal:1234/v1`
- Ollama: `http://host.docker.internal:11434`

When switching to a non-local provider with no saved profile, stale local API
bases are cleared.

## Safe Extension Points

- Add provider-specific defaults to the `localDefaults` map.
- Add model slots to `modelSections` if core model config adds new slots.
- Extend `normalizeModel` when new model settings must persist across provider
  switches.
- Keep DOM observers scoped to provider selects, config pages, and modals.

## Compatibility Notes

- The hook expects the `_model_config` plugin and a `modelConfig` Alpine store.
- Provider-switch controls resolve their model context through Alpine's public
  `$data(element)` accessor; do not depend on private element expandos such as
  `_x_dataStack`, which are absent on current Spine and newer A0 WebUI builds.
- Current local provider IDs are `lm_studio` and `ollama`.
- Current Spine Model Configuration hides the API-base input for those local
  providers. Their documented local defaults are still applied and persisted
  in the profile; browser checks should validate the restored model state rather
  than attempting to type into that host-hidden control.
- Do not install a duplicate non-underscore `provider_profiles` plugin beside
  this overlay.
- The active GPU-pre container did not include this plugin, so deploy it
  intentionally and verify UI behavior before treating it as active runtime
  parity.

## Verification Checklist

- Confirm the plugin appears in plugin discovery with version `0.9.9`.
- Open Model Configuration without UI freezes.
- Set LM Studio or Ollama API base/model, switch away, then switch back and
  confirm values restore. On current Spine, set the model name through the UI
  and verify the automatic local API-base default in the restored model state.
- Confirm outgoing provider values are saved before switching.
- Confirm local-provider defaults are supplied during model search.
- Confirm stale local API bases are cleared when switching to a non-local
  provider without a saved profile.
