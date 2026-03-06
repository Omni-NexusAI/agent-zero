"""
Kokoro GPU Worker
------------------

This lightweight HTTP service runs the Kokoro TTS pipeline inside a GPU-enabled
container and exposes two endpoints:

GET  /health       ??? Returns device & status metadata
POST /synthesize   ??? Generates audio for the provided sentences/voices

Auth (optional):
    Set KOKORO_WORKER_TOKEN to require `Authorization: Bearer <token>` or
    `X-Kokoro-Worker-Token` headers on incoming requests.
"""

from __future__ import annotations

import base64
import io
import os
import threading
from typing import List

import numpy as np
import soundfile as sf
from flask import Flask, jsonify, request

import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from python.helpers.device_utils import resolve_device, log_device_resolution
from python.helpers.print_style import PrintStyle

app = Flask(__name__)

KOKORO_DEVICE = os.getenv("KOKORO_DEVICE", "cuda:auto")
DEFAULT_VOICE = os.getenv("KOKORO_VOICE", "am_michael")
DEFAULT_VOICE_SECONDARY = os.getenv("KOKORO_VOICE_SECONDARY", "")
DEFAULT_SPEED = float(os.getenv("KOKORO_SPEED", "1.1"))
HOST = os.getenv("KOKORO_HOST", "0.0.0.0")
PORT = int(os.getenv("KOKORO_PORT", "8891"))
AUTH_TOKEN = os.getenv("KOKORO_WORKER_TOKEN", "").strip()

_pipeline = None
_current_device = None
_reload_lock = threading.Lock()


def _ensure_pipeline():
    global _pipeline, _current_device
    if _pipeline is not None:
        return

    with _reload_lock:
        if _pipeline is not None:
            return

        PrintStyle.standard(f"[Kokoro Worker] Loading pipeline on {KOKORO_DEVICE}...")
        device, meta = resolve_device(KOKORO_DEVICE)
        log_device_resolution(device, meta)

        from kokoro import KPipeline

        _pipeline = KPipeline(
            lang_code="a",
            repo_id="hexgrad/Kokoro-82M",
            device=device,
        )
        _current_device = device
        PrintStyle.success(f"[Kokoro Worker] Pipeline ready on {device}")


def _auth_ok() -> bool:
    if not AUTH_TOKEN:
        return True
    header = request.headers.get("Authorization", "")
    token = ""
    if header.lower().startswith("bearer "):
        token = header.split(" ", 1)[1].strip()
    if not token:
        token = request.headers.get("X-Kokoro-Worker-Token", "").strip()
    return token == AUTH_TOKEN


def _synthesize_local(
    sentences: List[str],
    voice: str | None,
    blend_voice: str | None,
    speed: float | None,
) -> str:
    _ensure_pipeline()

    primary_voice = voice or DEFAULT_VOICE
    secondary_voice = blend_voice or DEFAULT_VOICE_SECONDARY or None
    playback_speed = speed or DEFAULT_SPEED

    combined_audio: list[float] = []
    for sentence in sentences:
        text = sentence.strip()
        if not text:
            continue

        if secondary_voice:
            try:
                import torch
                # Manually blend voices (50/50 split) using style vectors
                v1 = _pipeline.load_single_voice(primary_voice)
                v2 = _pipeline.load_single_voice(secondary_voice)
                use_voice = torch.mean(torch.stack([v1, v2]), dim=0)
            except Exception as e:
                PrintStyle.error(f"[Kokoro Worker] Voice blending failed: {e}")
                use_voice = primary_voice
        else:
            use_voice = primary_voice

        segments = _pipeline(  # type: ignore
            text,
            voice=use_voice,
            speed=playback_speed,
        )
        
        audio_chunk: list[float] = []
        for seg in list(segments):
            audio_tensor = seg.audio
            audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
            audio_chunk.extend(audio_numpy)

        combined_audio.extend(audio_chunk)

    buffer = io.BytesIO()
    sf.write(buffer, combined_audio, 24000, format="WAV")
    audio_bytes = buffer.getvalue()
    return base64.b64encode(audio_bytes).decode("utf-8")


@app.route("/health", methods=["GET"])
def health():
    if not _auth_ok():
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    status = {
        "success": True,
        "device_policy": KOKORO_DEVICE,
        "device": _current_device,
        "pipeline_loaded": _pipeline is not None,
    }
    return jsonify(status)


@app.route("/synthesize", methods=["POST"])
def synthesize():
    if not _auth_ok():
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    sentences = payload.get("sentences") or []
    if not isinstance(sentences, list) or not sentences:
        return jsonify({"success": False, "error": "Missing sentences"}), 400

    try:
        audio_b64 = _synthesize_local(
            sentences,
            voice=payload.get("voice"),
            blend_voice=payload.get("voice2"),
            speed=float(payload.get("speed")) if payload.get("speed") else None,
        )
        return jsonify({"success": True, "audio": audio_b64})
    except Exception as exc:  # pragma: no cover - defensive logging
        PrintStyle.error(f"[Kokoro Worker] synthesis failed: {exc}")
        return jsonify({"success": False, "error": str(exc)}), 500


if __name__ == "__main__":
    PrintStyle.standard(
        f"[Kokoro Worker] starting on {HOST}:{PORT} (device policy: {KOKORO_DEVICE})"
    )
    app.run(host=HOST, port=PORT, threaded=True)

