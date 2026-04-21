# Enhanced Speech (Builtin)

This builtin plugin represents the Agentspine speech enhancement layer for Kokoro TTS.

## Included behavior

- Voice blending support via primary/secondary voice settings
- Speech settings compatibility with Agentspine's runtime
- Update-safe plugin identity for builtin loading

## Notes

Runtime synthesis logic remains in core helper modules used by the speech pipeline.
This plugin provides stable metadata/packaging so the enhancement survives in-place updates.
