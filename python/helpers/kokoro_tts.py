# kokoro_tts.py

import base64
import io
import warnings
import asyncio
import numpy as np
import soundfile as sf
import threading
from python.helpers.print_style import PrintStyle
from python.helpers import settings as settings_helper
from python.helpers.device_utils import resolve_device, log_device_resolution
from python.helpers.notification import NotificationManager, NotificationType, NotificationPriority

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

_pipeline = None
_voice = "am_puck"
_speed = 1.1
_device_policy = "auto"
_current_device = None
is_updating_model = False
_reload_lock = threading.Lock()


async def preload():
    try:
        return await _preload()
    except Exception as e:
        raise e


async def _preload():
    global _pipeline, is_updating_model, _device_policy, _current_device

    while is_updating_model:
        await asyncio.sleep(0.1)

    try:
        is_updating_model = True
        if not _pipeline:
            from agent import AgentContext
            # Resolve device from settings
            try:
                current_settings = settings_helper.get_settings()
                _device_policy = current_settings.get("tts_device", "auto")
            except Exception:
                _device_policy = "auto"
            torch_device, meta = resolve_device(_device_policy)
            
            # Notify user of initial load (toast)
            NotificationManager.send_notification(
                NotificationType.INFO,
                NotificationPriority.NORMAL,
                message=f"Loading Kokoro TTS model on {torch_device}...",
                title="Kokoro TTS",
                display_time=5,
                group="kokoro-preload",
            )
            PrintStyle.standard(f"Loading Kokoro TTS model on {torch_device}...")
            log_device_resolution(torch_device, meta)

            from kokoro import KPipeline
            _pipeline = KPipeline(
                lang_code="a",
                repo_id="hexgrad/Kokoro-82M",
                device=torch_device,
            )
            _current_device = torch_device
            
            # Notify user of successful load (toast)
            NotificationManager.send_notification(
                NotificationType.SUCCESS,
                NotificationPriority.NORMAL,
                message=f"Kokoro TTS model loaded on {torch_device} successfully.",
                title="Kokoro TTS",
                display_time=3,
                group="kokoro-preload",
            )
            PrintStyle.standard(f"Kokoro TTS model loaded on {torch_device} successfully.")
            
            # Cache defaults from settings
            try:
                _apply_runtime_defaults(current_settings)
            except Exception:
                pass
    finally:
        is_updating_model = False


def _apply_runtime_defaults(current_settings: dict):
    global _voice, _speed
    _voice = current_settings.get("tts_kokoro_voice", _voice)
    try:
        _speed = float(current_settings.get("tts_kokoro_speed", _speed))
    except Exception:
        pass


async def is_downloading():
    try:
        return _is_downloading()
    except Exception as e:
        raise e


def _is_downloading():
    return is_updating_model

async def is_downloaded():
    try:
        return _is_downloaded()
    except Exception as e:
        raise e

def _is_downloaded():
    return _pipeline is not None


def set_voice(voice: str):
    global _voice
    _voice = voice


def set_speed(speed: float):
    global _speed
    _speed = speed


def set_device_policy(policy: str):
    global _device_policy, _pipeline
    if policy != _device_policy:
        _device_policy = policy
        # Force re-init
        _pipeline = None


async def reload_model(device_policy: str):
    """Reload the Kokoro TTS model on a new device"""
    try:
        return await _reload_model(device_policy)
    except Exception as e:
        raise e


async def _reload_model(device_policy: str):
    """Internal function to reload model with thread safety"""
    global _pipeline, _device_policy, _current_device, is_updating_model, _reload_lock
    
    with _reload_lock:
        # Check if device actually changed
        new_device, meta = resolve_device(device_policy)
        if _current_device == new_device and _pipeline is not None:
            return True  # No change needed
        
        # Notify user of reload start (toast)
        NotificationManager.send_notification(
            NotificationType.INFO,
            NotificationPriority.HIGH,
            message=f"Loading Kokoro TTS model on {new_device}...",
            title="Kokoro TTS",
            display_time=5,
            group="kokoro-reload",
        )
        PrintStyle.standard(f"Reloading Kokoro TTS model on {new_device}...")
        
        while is_updating_model:
            await asyncio.sleep(0.1)
        
        try:
            is_updating_model = True
            
            # Tear down old model
            if _pipeline:
                try:
                    # Clear CUDA cache if switching from CUDA
                    if _current_device and "cuda" in str(_current_device).lower():
                        import torch
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                except Exception as e:
                    PrintStyle.error(f"Error clearing CUDA cache: {e}")
                
                _pipeline = None
            
            # Update device policy
            _device_policy = device_policy
            log_device_resolution(new_device, meta)
            
            # Load new model
            from kokoro import KPipeline
            _pipeline = KPipeline(
                lang_code="a",
                repo_id="hexgrad/Kokoro-82M",
                device=new_device,
            )
            _current_device = new_device
            
            # Notify user of successful reload (toast)
            NotificationManager.send_notification(
                NotificationType.SUCCESS,
                NotificationPriority.HIGH,
                message=f"Kokoro TTS model loaded on {new_device} successfully.",
                title="Kokoro TTS",
                display_time=3,
                group="kokoro-reload",
            )
            PrintStyle.standard(f"Kokoro TTS model loaded on {new_device} successfully.")
            
            return True
            
        except Exception as e:
            PrintStyle.error(f"Failed to reload Kokoro TTS model: {e}")
            NotificationManager.send_notification(
                NotificationType.ERROR,
                NotificationPriority.HIGH,
                message=f"Failed to reload Kokoro TTS model: {e}",
                title="Kokoro TTS",
                display_time=5,
                group="kokoro-reload",
            )
            return False
        finally:
            is_updating_model = False


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
            text = sentence.strip()
            if not text:
                continue

            segments1 = _pipeline(
                text,
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
                    text,
                    voice=blend_voice,
                    speed=_speed,
                )  # type: ignore
                audio2: list[float] = []
                for seg in list(segments2):
                    audio_tensor = seg.audio
                    audio_numpy = audio_tensor.detach().cpu().numpy()  # type: ignore
                    audio2.extend(audio_numpy)

                min_len = min(len(audio1), len(audio2))
                if min_len > 0:
                    mixed = (np.array(audio1[:min_len]) + np.array(audio2[:min_len])) / 2.0
                    combined_audio.extend(mixed.tolist())
                else:
                    combined_audio.extend(audio1)
            else:
                combined_audio.extend(audio1)

        # Convert combined audio to bytes
        buffer = io.BytesIO()
        sf.write(buffer, combined_audio, 24000, format="WAV")
        audio_bytes = buffer.getvalue()

        # Return base64 encoded audio
        return base64.b64encode(audio_bytes).decode("utf-8")

    except Exception as e:
        PrintStyle.error(f"Error in Kokoro TTS synthesis: {e}")
        raise    
