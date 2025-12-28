"""
Lightweight Kokoro GPU worker.

Exposes HTTP endpoints for health checks and speech synthesis using the Kokoro
pipeline. Designed to run inside the dedicated Kokoro GPU container.
"""

from __future__ import annotations

import base64
import io
import os
from typing import Iterable, List

import numpy as np
import soundfile as sf
from flask import Flask, jsonify, request
from kokoro import KPipeline

# Configuration via environment variables
HOST = os.getenv("KOKORO_HOST", "0.0.0.0")
PORT = int(os.getenv("KOKORO_PORT", "8891"))
DEVICE = os.getenv("KOKORO_DEVICE", "cuda:auto")
TOKEN = os.getenv("KOKORO_WORKER_TOKEN")
DEFAULT_VOICE = os.getenv("KOKORO_VOICE", "am_michael")
DEFAULT_SPEED = float(os.getenv("KOKORO_SPEED", "1.1"))

app = Flask(__name__)
_pipeline: KPipeline | None = None


def _require_auth() -> bool:
    """Return True if request is authorized or auth is not configured."""
    if not TOKEN:
        return True
    auth_header = request.headers.get("Authorization", "")
    return auth_header == f"Bearer {TOKEN}"


def _ensure_pipeline() -> KPipeline:
    global _pipeline
    if _pipeline is None:
        # Lazy-load to avoid startup latency if container is probed for health
        _pipeline = KPipeline(
            lang_code="a",
            repo_id="hexgrad/Kokoro-82M",
            device=DEVICE,
        )
    return _pipeline


def _synthesize(sentences: Iterable[str], voice: str, blend_voice: str | None, speed: float) -> str:
    pipeline = _ensure_pipeline()
    combined_audio: List[float] = []

    for text in sentences:
        clean = text.strip()
        if not clean:
            continue

        segments_primary = pipeline(clean, voice=voice, speed=speed)
        audio_primary: list[float] = []
        for seg in list(segments_primary):
            audio_tensor = seg.audio
            audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
            audio_primary.extend(audio_numpy)

        if blend_voice:
            segments_blend = pipeline(clean, voice=blend_voice, speed=speed)
            audio_blend: list[float] = []
            for seg in list(segments_blend):
                audio_tensor = seg.audio
                audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
                audio_blend.extend(audio_numpy)

            min_len = min(len(audio_primary), len(audio_blend))
            if min_len > 0:
                mixed = (np.array(audio_primary[:min_len]) + np.array(audio_blend[:min_len])) / 2.0
                combined_audio.extend(mixed.tolist())
            else:
                combined_audio.extend(audio_primary)
        else:
            combined_audio.extend(audio_primary)

    buffer = io.BytesIO()
    sf.write(buffer, combined_audio, 24000, format="WAV")
    audio_bytes = buffer.getvalue()
    return base64.b64encode(audio_bytes).decode("utf-8")


@app.before_request
def _auth_middleware():
    if not _require_auth():
        return jsonify({"error": "unauthorized"}), 401
    return None


@app.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "device": DEVICE,
            "loaded": _pipeline is not None,
        }
    )


@app.post("/synthesize")
def synthesize():
    try:
        payload = request.get_json(force=True, silent=True) or {}
        text = payload.get("text")
        sentences = payload.get("sentences")

        # Normalize sentences input
        items: list[str] = []
        if isinstance(sentences, list):
            items = [str(x) for x in sentences]
        elif isinstance(text, str):
            items = [text]
        else:
            return jsonify({"error": "text or sentences is required"}), 400

        voice = payload.get("voice") or DEFAULT_VOICE
        blend_voice = payload.get("blend_voice") or payload.get("voice2")

        try:
            speed = float(payload.get("speed", DEFAULT_SPEED))
        except Exception:
            speed = DEFAULT_SPEED

        audio_b64 = _synthesize(items, voice=voice, blend_voice=blend_voice, speed=speed)

        return jsonify(
            {
                "audio": audio_b64,
                "sample_rate": 24000,
                "voice": voice,
                "blend_voice": blend_voice,
                "speed": speed,
            }
        )
    except Exception as exc:  # pragma: no cover - best-effort safety
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host=HOST, port=PORT, debug=False)


