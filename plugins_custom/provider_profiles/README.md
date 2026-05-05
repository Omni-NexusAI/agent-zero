# Provider Profiles

Portable custom plugin package for the Provider Profiles model configurator additions.

## Scope
This plugin intentionally contains only the portable behavior added on top of the base A0 model configurator:

- remember the last model used per provider and model slot
- restore that provider-specific model when switching back
- auto-fill local provider API bases for LM Studio and Ollama
- clear stale model names when switching to a provider with no saved selection

It does not ship the full `_model_config` built-in plugin and does not depend on the Agentspine Identity Module.

## Compatibility
- Agent Zero/Agentspine runtimes with the v1.7 plugin loader and `_model_config` UI store.
- Safe on unsupported hosts: the plugin waits for `$store.modelConfig` and exits if it is unavailable.