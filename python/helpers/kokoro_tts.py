# kokoro_tts.py

import base64
import io
import warnings
import asyncio
import torch
import soundfile as sf
import numpy as np
import os
from datetime import datetime
from python.helpers import runtime, files
from python.helpers.print_style import PrintStyle

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

_pipeline = None
_voice = "am_puck"
_speed = 1.1
_device = "cuda" if torch.cuda.is_available() else "cpu"
is_updating_model = False


async def preload():
    try:
        # return await runtime.call_development_function(_preload)
        return await _preload()
    except Exception as e:
        # if not runtime.is_development():
        raise e
        # Fallback to direct execution if RFC fails in development
        # PrintStyle.standard("RFC failed, falling back to direct execution...")
        # return await _preload()


async def _preload():
    global _pipeline, is_updating_model

    while is_updating_model:
        await asyncio.sleep(0.1)

    try:
        is_updating_model = True
        if not _pipeline:
            PrintStyle.standard("Loading Kokoro TTS model...")
            from kokoro import KPipeline
            _pipeline = KPipeline(
                lang_code="a",
                repo_id="hexgrad/Kokoro-82M",
                device=_device,
            )
    finally:
        is_updating_model = False


async def is_downloading():
    try:
        # return await runtime.call_development_function(_is_downloading)
        return _is_downloading()
    except Exception as e:
        # if not runtime.is_development():
        raise e
        # Fallback to direct execution if RFC fails in development
        # return _is_downloading()


def _is_downloading():
    return is_updating_model

async def is_downloaded():
    try:
        # return await runtime.call_development_function(_is_downloaded)
        return _is_downloaded()
    except Exception as e:
        # if not runtime.is_development():
        raise e
        # Fallback to direct execution if RFC fails in development
        # return _is_downloaded()

def _is_downloaded():
    return _pipeline is not None


def set_voice(voice: str):
    """Set default Kokoro voice"""
    global _voice
    _voice = voice


def set_device(use_gpu: bool):
    """Select CPU or GPU for inference. Reloads model if changed."""
    global _device, _pipeline
    desired = "cuda" if use_gpu and torch.cuda.is_available() else "cpu"
    if desired != _device:
        _device = desired
        _pipeline = None  # Force reload on next use


async def synthesize_sentences(
    sentences: list[str],
    voice: str | None = None,
    blend_voice: str | None = None,
):
    """Generate audio for multiple sentences and return concatenated base64 audio"""
    try:
        return await _synthesize_sentences(sentences, voice, blend_voice)
    except Exception as e:
        raise e


async def _synthesize_sentences(
    sentences: list[str],
    voice: str | None = None,
    blend_voice: str | None = None,
):
    await _preload()

    combined_audio: list[float] = []

    try:
        for sentence in sentences:
            if sentence.strip():
                segments1 = _pipeline(
                    sentence.strip(),
                    voice=voice or _voice,
                    speed=_speed,
                )  # type: ignore
                audio1: list[float] = []
                for seg in list(segments1):
                    audio_tensor = seg.audio
                    audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
                    audio1.extend(audio_numpy)

                if blend_voice:
                    segments2 = _pipeline(
                        sentence.strip(),
                        voice=blend_voice,
                        speed=_speed,
                    )  # type: ignore
                    audio2: list[float] = []
                    for seg in list(segments2):
                        audio_tensor = seg.audio
                        audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
                        audio2.extend(audio_numpy)

                    min_len = min(len(audio1), len(audio2))
                    mixed = (
                        np.array(audio1[:min_len]) + np.array(audio2[:min_len])
                    ) / 2
                    combined_audio.extend(mixed.tolist())
                else:
                    combined_audio.extend(audio1)

        # Convert combined audio to bytes
        buffer = io.BytesIO()
        sf.write(buffer, combined_audio, 24000, format="WAV")
        audio_bytes = buffer.getvalue()

        # Optionally save recording
        from python.helpers import settings

        if settings.get_settings().get("tts_record_mode"):
            record_dir = files.get_abs_path("logs", "tts")
            os.makedirs(record_dir, exist_ok=True)
            fname = datetime.now().strftime("%Y%m%d_%H%M%S_%f.wav")
            with open(os.path.join(record_dir, fname), "wb") as f:
                f.write(audio_bytes)

        # Return base64 encoded audio
        return base64.b64encode(audio_bytes).decode("utf-8")

    except Exception as e:
        PrintStyle.error(f"Error in Kokoro TTS synthesis: {e}")
        raise
