# Provider Profiles DOX

## Purpose

`_provider_profiles` preserves model settings per provider and model slot when
users switch providers in Agentspine model configuration.

## Ownership

- `plugin.yaml` owns package identity, version, and model settings-section
  association.
- `extensions/webui/page-head/_10_provider_profiles.html` owns the active
  browser hook for `_model_config` and the `modelConfig` Alpine store.
- `webui/thumbnail.svg` owns the canonical blue-server plugin-card icon
  (SHA-256 `100083e05d213c528dd7a5ececbdec0d427d9b1628a55e28f14a05b7b14ad877`).
  It must match the portable A0 `provider_profiles` custom package; never
  package the archived three-slider asset.
- Runtime profile state belongs in
  `/a0/usr/plugins/_provider_profiles/config.json`.

## Local Contracts

- Keep profile keys in the shape `<model slot>:<provider>`.
- Preserve all fields listed in the README when normalizing models.
- Keep local provider defaults for LM Studio and Ollama unless model-config
  provider IDs change.
- Do not install or document a duplicate non-underscore `provider_profiles`
  plugin beside this overlay.

## Work Guidance

- Add new local-provider defaults to the `localDefaults` map.
- Add new model slots to `modelSections`.
- Extend `normalizeModel` whenever a new model setting must survive provider
  switches.
- Keep DOM observers scoped to provider selects, model config pages, and modals.
- Resolve a provider select's model context through Alpine's public
  `$data(element)` API; do not use private DOM expandos for compatibility.
- Current Spine hides local-provider API-base inputs; validate restored local
  defaults through model state after a visible provider-switch flow.

## Verification

- Open Model Configuration without UI freezes.
- Switch providers away and back, then confirm model/API base/context fields
  restore for each affected model slot.
- Confirm local-provider defaults are supplied for model search.

## Child DOX Index

This plugin has no child DOX files.
