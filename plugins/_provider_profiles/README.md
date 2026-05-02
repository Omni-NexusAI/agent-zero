# Provider Profiles

Built-in Agentspine plugin for the provider-profile behavior added on top of the base A0 model configurator.

## Scope

This plugin intentionally contains only the Agentspine model configurator overlay:

- remember the last model used per provider and model slot
- restore that provider-specific model when switching back
- auto-fill local provider API bases for LM Studio and Ollama
- clear stale model names when switching to a provider with no saved selection

It does not ship the full `_model_config` plugin.
