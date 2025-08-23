# kokoro_tts.py

import base64
import io
import warnings
import asyncio
import os
import soundfile as sf
from python.helpers import runtime
from python.helpers.print_style import PrintStyle

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

_pipeline = None
_voice = "am_puck,am_onyx"


def _validate_speed(value: float | str) -> float:
    """Validate and convert a speed value to ``float``.

    Parameters
    ----------
    value:
        The speed as a ``float`` or string representation.

    Returns
    -------
    float
        The validated speed value.

    Raises
    ------
    ValueError
        If the value cannot be converted to ``float`` or is not positive.
    """

    try:
        speed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Invalid Kokoro TTS speed '{value}'") from exc
    if speed <= 0:
        raise ValueError("Kokoro TTS speed must be positive")
    return speed


try:
    _speed = _validate_speed(os.getenv("KOKORO_TTS_SPEED", "1.1"))
except ValueError:
    _speed = 1.1

is_updating_model = False


def set_speed(speed: float | str) -> None:
    """Set the default synthesis speed for Kokoro TTS."""

    global _speed
    _speed = _validate_speed(speed)


def _resolve_device(device: str | None) -> str | None:
    """Return a normalised device string or ``None`` for auto-selection.

    Order of precedence: explicit ``device`` argument, environment variable
    ``KOKORO_TTS_DEVICE``, then automatic device selection inside ``KPipeline``.
    Supported values are ``"cpu"`` and ``"cuda"`` (or ``"gpu"``).
    """

    if device is None:
        device = os.getenv("KOKORO_TTS_DEVICE")

    if not device:
        return None

    device = device.strip().lower()
    if device in {"cuda", "gpu"}:
        return "cuda"
    if device == "cpu":
        return "cpu"
    raise ValueError(f"Invalid Kokoro device '{device}'")


def _blend_voice_style(spec: str) -> list[tuple[str, float]]:
    """Parse a voice blend specification and validate weights.

    The specification is a comma separated list where each entry is a voice
    name optionally followed by ``:weight``.  Missing weights default to
    ``1.0``.  The resulting weights are normalised so that they sum to ``1``.

    Parameters
    ----------
    spec:
        Blend specification, e.g. ``"am_puck:0.7,am_onyx:0.3"``.

    Returns
    -------
    list[tuple[str, float]]
        A list of ``(voice, normalised_weight)`` pairs.

    Raises
    ------
    ValueError
        If any weight is negative, the sum of weights is zero, or the
        specification cannot be parsed.
    """

    voices: list[str] = []
    weights: list[float] = []

    for part in spec.split(','):
        part = part.strip()
        if not part:
            continue
        if ':' in part:
            name, weight_str = part.split(':', 1)
            try:
                weight = float(weight_str)
            except ValueError as exc:
                raise ValueError(
                    f"Invalid weight '{weight_str}' in blend specification: '{spec}'"
                ) from exc
        else:
            name = part
            weight = 1.0
        voices.append(name.strip())
        weights.append(weight)

    if not voices:
        raise ValueError("No voices specified for blend")
    if any(w < 0 for w in weights):
        raise ValueError("Voice blend weights must be non-negative")
    total = sum(weights)
    if total == 0:
        raise ValueError("Voice blend weights must sum to a positive number")

    normalised = [w / total for w in weights]
    return list(zip(voices, normalised))


async def preload(device: str | None = None):
    """Preload the Kokoro TTS model on the requested device.

    ``device`` may be ``"cpu"`` or ``"cuda"``; if omitted it falls back to the
    ``KOKORO_TTS_DEVICE`` environment variable or auto-selection.
    """
    try:
        # return await runtime.call_development_function(_preload, device)
        return await _preload(device)
    except Exception as e:
        # if not runtime.is_development():
        raise e
        # Fallback to direct execution if RFC fails in development
        # PrintStyle.standard("RFC failed, falling back to direct execution...")
        # return await _preload(device)


async def _preload(device: str | None = None):
    global _pipeline, is_updating_model

    while is_updating_model:
        await asyncio.sleep(0.1)

    try:
        is_updating_model = True
        if not _pipeline:
            PrintStyle.standard("Loading Kokoro TTS model...")
            from kokoro import KPipeline
            resolved_device = _resolve_device(device)
            _pipeline = KPipeline(
                lang_code="a", repo_id="hexgrad/Kokoro-82M", device=resolved_device
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


async def synthesize_sentences(
    sentences: list[str], speed: float | str | None = None
):
    """Generate audio for multiple sentences and return concatenated base64 audio"""
    try:
        # return await runtime.call_development_function(_synthesize_sentences, sentences)
        return await _synthesize_sentences(sentences, speed)
    except Exception as e:
        # if not runtime.is_development():
        raise e
        # Fallback to direct execution if RFC fails in development
        # return await _synthesize_sentences(sentences)


async def _synthesize_sentences(
    sentences: list[str], speed: float | str | None = None
):
    await _preload()

    local_speed = _speed if speed is None else _validate_speed(speed)
    combined_audio = []

    try:
        for sentence in sentences:
            if sentence.strip():
                segments = _pipeline(
                    sentence.strip(), voice=_voice, speed=local_speed
                )  # type: ignore
                segment_list = list(segments)

                for segment in segment_list:
                    audio_tensor = segment.audio
                    audio_numpy = audio_tensor.detach().cpu().numpy() # type: ignore
                    combined_audio.extend(audio_numpy)

        # Convert combined audio to bytes
        buffer = io.BytesIO()
        sf.write(buffer, combined_audio, 24000, format="WAV")
        audio_bytes = buffer.getvalue()

        # Return base64 encoded audio
        return base64.b64encode(audio_bytes).decode("utf-8")

    except Exception as e:
        PrintStyle.error(f"Error in Kokoro TTS synthesis: {e}")
        raise    
