# Convo

Convo adds a local-first voice conversation alongside Agent Zero's text chat. It is the planned built-in successor to Enhanced Speech, preserving native dictation while connecting a conversational model to background agent work.

**Development status:** implementation in progress. Not deployed or certified for live use. Existing speech services and the standalone pipeline remain unchanged.

## Delivery checklist

- [ ] Reversible Enhanced Speech migration and capability-based configuration
- [ ] Authenticated transport, native controls and audio pipeline
- [ ] Persistent linked histories and background job bridge
- [ ] Personality inheritance, semantic gating and interruption
- [ ] Concurrent prefix-safe compaction
- [ ] Explicit model downloads and supported Voice Studio controls
- [ ] Isolated automated tests
- [ ] Both-host integration, combined-load measurements and user listening acceptance

Implementation is developed on a dedicated feature branch against Agent Spine development. No merge, production deployment, model download or protected service lifecycle action is implied by the draft PR.
