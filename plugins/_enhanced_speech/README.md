# Enhanced Speech

Builtin Agentspine speech enhancement plugin.

This plugin owns the enhanced speech behavior used by Agentspine and is intended to remain portable across standard CPU, CUDA-capable GPU, and compatible upstream A0-style runtimes.

## Features

- Browser microphone capture with `MediaRecorder`, WebM/Opus preference, final-stop handling, and empty-audio rejection.
- Plugin-owned transcription route at `/api/plugins/_enhanced_speech/transcribe`, with fallback-friendly payload support for `audio` and `mime_type`.
- Runtime capability route at `/api/plugins/_enhanced_speech/capabilities`.
- Whisper STT device controls that adapt to live Torch/CUDA availability.
- Kokoro TTS controls, local CUDA support, remote worker compatibility, secondary voice blending, and blend ratio support.
- Normal chat handoff after STT so voice messages enter the same LLM/TTS path as typed messages.

## CUDA Behavior

The plugin treats build labels as hints and live runtime detection as the source of truth. If Torch reports CUDA, the speech settings can expose `cuda:auto` and indexed devices such as `cuda:0`. If CUDA is missing or Docker was started without GPU access, the plugin falls back to CPU controls and reports a warning through the capabilities response.

The plugin does not install CUDA, GPU PyTorch wheels, Whisper, Kokoro, or system drivers into a CPU-only image. A target runtime must already provide compatible dependencies for GPU inference.

## Install Expectations

Install this plugin into a runtime that supports Agent Zero plugin API handlers, WebUI extensions, and startup extensions. On compatible Agentspine/A0 builds with CUDA-capable Torch in the framework runtime, Whisper controls are exposed automatically. On CPU-only runtimes, the same plugin remains usable with CPU STT/TTS options.

## Recovery Reference

For the v0.9.9 GPU pre line, the reference behavior is:

- Standard source/image remains the maintained base.
- GPU is derived through the addon image path with `BUILD_VARIANT=fullGPU` and `PYTORCH_VARIANT=cuda`.
- Whisper STT and Kokoro TTS should both report CUDA options when the container has GPU access.
- The visible build banner should show the GPU pre tag when running the GPU addon build.
