"""Compose-owned GPU Kokoro worker for the Enhanced Speech remote protocol."""

from __future__ import annotations

import base64
import io
import os
import threading
from typing import Any

import soundfile as sf
from flask import Flask, jsonify, request


app = Flask(__name__)

DEVICE_POLICY = os.getenv("KOKORO_DEVICE", "cuda:auto").strip().lower()
HOST = os.getenv("KOKORO_HOST", "0.0.0.0")
PORT = int(os.getenv("KOKORO_PORT", "8891"))
AUTH_TOKEN = os.getenv("KOKORO_WORKER_TOKEN", "").strip()

_pipeline: Any | None = None
_device = ""
_pipeline_lock = threading.Lock()


def _authorization_ok() -> bool:
    if not AUTH_TOKEN:
        return True
    header = request.headers.get("Authorization", "")
    token = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else ""
    return token == AUTH_TOKEN or request.headers.get("X-Kokoro-Worker-Token", "").strip() == AUTH_TOKEN


def _resolve_device() -> str:
    if DEVICE_POLICY in {"cpu", "none"}:
        return "cpu"
    import torch

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested for the Kokoro worker but is unavailable.")
    return "cuda"


def _ensure_pipeline() -> Any:
    global _pipeline, _device
    if _pipeline is not None:
        return _pipeline
    with _pipeline_lock:
        if _pipeline is None:
            from kokoro import KPipeline

            _device = _resolve_device()
            _pipeline = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M", device=_device)
            app.logger.info("Kokoro pipeline loaded on %s", _device)
    return _pipeline


def _voice_value(pipeline: Any, primary: str, secondary: str, blend: int) -> Any:
    if not secondary:
        return primary
    ratio = max(1, min(99, int(blend))) / 100.0
    return pipeline.load_voice(primary) * ratio + pipeline.load_voice(secondary) * (1.0 - ratio)


def _audio_samples(segment: Any) -> list[float]:
    """Normalize Kokoro's documented `(graphemes, phonemes, audio)` result."""
    audio = segment[-1] if isinstance(segment, tuple) else getattr(segment, "audio", segment)
    if hasattr(audio, "detach"):
        audio = audio.detach().cpu().numpy()
    elif hasattr(audio, "cpu"):
        audio = audio.cpu().numpy()
    if hasattr(audio, "tolist"):
        audio = audio.tolist()
    return list(audio)


def _synthesize(payload: dict[str, Any]) -> str:
    sentences = payload.get("sentences")
    if not isinstance(sentences, list) or not any(str(sentence).strip() for sentence in sentences):
        raise ValueError("sentences must contain at least one non-empty string")

    pipeline = _ensure_pipeline()
    primary = str(payload.get("voice") or "am_michael")
    secondary = str(payload.get("voice2") or "").strip()
    speed = float(payload.get("speed") or 1.1)
    if speed <= 0:
        raise ValueError("speed must be greater than zero")
    voice = _voice_value(pipeline, primary, secondary, int(payload.get("blend") or 50))

    samples: list[float] = []
    for sentence in sentences:
        text = str(sentence).strip()
        if not text:
            continue
        for segment in pipeline(text, voice=voice, speed=speed):
            samples.extend(_audio_samples(segment))
    if not samples:
        raise ValueError("Kokoro produced no audio")

    output = io.BytesIO()
    sf.write(output, samples, 24000, format="WAV")
    return base64.b64encode(output.getvalue()).decode("ascii")


@app.get("/health")
def health():
    if not _authorization_ok():
        return jsonify(success=False, error="Unauthorized"), 401
    return jsonify(
        success=True,
        device_policy=DEVICE_POLICY,
        device=_device,
        pipeline_loaded=_pipeline is not None,
    )


@app.post("/synthesize")
def synthesize():
    if not _authorization_ok():
        return jsonify(success=False, error="Unauthorized"), 401
    try:
        return jsonify(success=True, audio=_synthesize(request.get_json(silent=True) or {}))
    except Exception as exc:  # return an explicit protocol failure to the plugin
        app.logger.exception("Kokoro synthesis failed")
        return jsonify(success=False, error=str(exc)), 500


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, threaded=True)
