import base64
import warnings
import whisper
import tempfile
import asyncio
import torch
from helpers import runtime, rfc, settings, files
from helpers.device_utils import resolve_device, log_device_resolution
from helpers.print_style import PrintStyle
from helpers.notification import NotificationManager, NotificationType, NotificationPriority

# Suppress FutureWarning from torch.load
warnings.filterwarnings("ignore", category=FutureWarning)

_model = None
_model_name = ""
_model_device = ""
is_updating_model = False  # Tracks whether the model is currently updating

_MIME_SUFFIXES = {
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "video/webm": ".webm",
    "audio/ogg": ".ogg",
    "application/ogg": ".ogg",
    "audio/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/flac": ".flac",
}


def _suffix_from_mime_type(mime_type: str | None) -> str:
    value = (mime_type or "").split(";", 1)[0].strip().lower()
    return _MIME_SUFFIXES.get(value, ".wav")


def _strip_data_url(audio_bytes_b64: str) -> str:
    if "," in audio_bytes_b64 and audio_bytes_b64.lstrip().startswith("data:"):
        return audio_bytes_b64.split(",", 1)[1]
    return audio_bytes_b64

async def preload(model_name:str):
    try:
        # return await runtime.call_development_function(_preload, model_name)
        return await _preload(model_name)
    except Exception as e:
        # if not runtime.is_development():
        raise e
        
async def _preload(model_name:str):
    global _model, _model_name, _model_device, is_updating_model

    while is_updating_model:
        await asyncio.sleep(0.1)

    try:
        is_updating_model = True
        current_settings = settings.get_settings()
        device_policy = current_settings.get("stt_device", "auto")
        device, meta = resolve_device(device_policy)

        if not _model or _model_name != model_name or _model_device != device:
            NotificationManager.send_notification(
                NotificationType.INFO,
                NotificationPriority.NORMAL,
                f"Loading Whisper model on {device}...",
                display_time=99,
                group="whisper-preload")
            PrintStyle.standard(f"Loading Whisper model: {model_name} on {device}")
            log_device_resolution(device, meta)
            _model = whisper.load_model(
                name=model_name,
                device=device,
                download_root=files.get_abs_path("/tmp/models/whisper"),
            ) # type: ignore
            _model_name = model_name
            _model_device = device
            NotificationManager.send_notification(
                NotificationType.INFO,
                NotificationPriority.NORMAL,
                f"Whisper model loaded on {device}.",
                display_time=2,
                group="whisper-preload")
    finally:
        is_updating_model = False

async def is_downloading():
    # return await runtime.call_development_function(_is_downloading)
    return _is_downloading()

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
    return _model is not None

async def transcribe(model_name:str, audio_bytes_b64: str, mime_type: str | None = None):
    # return await runtime.call_development_function(_transcribe, model_name, audio_bytes_b64)
    return await _transcribe(model_name, audio_bytes_b64, mime_type=mime_type)


async def _transcribe(model_name:str, audio_bytes_b64: str, mime_type: str | None = None):
    await _preload(model_name)
    
    # Decode audio bytes if encoded as a base64 string
    audio_bytes = base64.b64decode(_strip_data_url(audio_bytes_b64))

    # Create temp audio file
    import os
    with tempfile.NamedTemporaryFile(suffix=_suffix_from_mime_type(mime_type), delete=False) as audio_file:
        audio_file.write(audio_bytes)
        temp_path = audio_file.name
    try:
        # Transcribe the audio file
        use_fp16 = bool(_model_device and "cuda" in _model_device.lower() and torch.cuda.is_available())
        result = _model.transcribe(temp_path, fp16=use_fp16) # type: ignore
        return result
    finally:
        try:
            os.remove(temp_path)
        except Exception:
            pass # ignore errors during cleanup
